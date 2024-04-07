import {asyncHandler} from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {User} from "../models/user.model.js";
import {uploadCloudinary, DeleteCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import Jwt  from "jsonwebtoken";
import mongoose from "mongoose";
const generateAccessAndRefreshToken = async(userId)=>{
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken=refreshToken;
        await user.save({ validateBeforeSave : false })
        return {accessToken,refreshToken}
    }catch(error){
        throw new ApiError(500,"something went wrong while generating refresh and access token");
    }
}
const registerUser = asyncHandler( async (req, res) => {
    const {username, fullName, email, password} = req.body;
    if([username,fullName,email,password].some((field)=>field?.trim()==="")){
        throw new ApiError(400,"All fields are Required");
    }
    const existedUser = await User.findOne({
        $or:[{username},{email}]
    })
    if(existedUser){
        throw new ApiError(409, "User Already Exists");
    }
    const avatarLocalFile= req.files?.avatar[0]?.path;
    // const coverLocalFile= req.files?.coverImage[0]?.path;
    let coverLocalFile;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverLocalFile=req.files.coverImage[0].path
    }
    if(!avatarLocalFile){
        throw new ApiError(400, "Avatar File is required")
    }
    const avatar = await uploadCloudinary(avatarLocalFile);
    const coverImage = await uploadCloudinary(coverLocalFile);
    if(!avatar){
        throw new ApiError(400, "Avatar File is required")
    }
    const users = await User.create({
        fullName,
        username:username.toLowerCase(),
        email,
        password,
        avatar:avatar.url,
        coverImage:coverImage?.url || ""
    });
    const createdUser =await User.findById(users._id).select(
        "-password -refreshToken"
    );
    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }
    return res.status(201).json(
        new ApiResponse(200,createdUser, "User Register Successfully!!")
    )

});
const loginUser = asyncHandler(async (req, res)=>{
    const {email, username, password}= req.body;
    if (!(username || email)) {
        throw new ApiError(400, "username or email is required");
    }
    const user = await User.findOne({
        $or:[{username}, {email}]
    })
    if(!user){
        throw new ApiError(404, "User dos not exist");
    }
    const isPasswordValid=await user.isPasswordCorrect(password);
    if(!isPasswordValid){
        throw new ApiError(401, "invalid user credential");
    }
    const {accessToken, refreshToken} = await generateAccessAndRefreshToken(user._id);
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    const options = {
        httpOnly : true,
        secure: true
    }
    return res.status(200).cookie("accessToken",accessToken, options).cookie("refreshToken", refreshToken, options).json(
        new ApiResponse(200, {user:loggedInUser, accessToken, refreshToken },"User logged in Successfully ")
    )
})
const logoutUser = asyncHandler(async(req, res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset:{refreshToken:1}
        },
        {
            new:true
        }
    )
    const options = {
        httpOnly : true,
        secure: true
    }
    res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(
        new ApiResponse(200,[], "User logged out")
    )

})
const refreshAccessToken = asyncHandler(async (req, res)=>{
    const incomingRefreshToken =  req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized request");
    }
    try {
        const decodedToken = Jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
        const user = User.findById(decodedToken?._id);
        if(!user){
            throw new ApiError(401, "Invalid Refresh Token");
        }
        if(incomingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used");
        }
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshToken(user._id);
        const options = {
            httpOnly : true,
            secure: true
        }
        return res.status(200).cookie("accessToken",accessToken, options).cookie("refreshToken", newRefreshToken, options).json(
            new ApiResponse(200, {accessToken, refreshToken :newRefreshToken },"Access token refreshed ")
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})
const changeCurrentPassword = asyncHandler(async (req, res)=>{
    const {oldPassword, newPassword} = req.body;
    const user = await User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);
    
    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid old Password");
    }
    user.password = newPassword;
    await user.save({validateBeforeSave:false});
    return res.status(200).json(
        new ApiResponse(200,{}, "Password Changed")
    )
})
const getCurrentUser = asyncHandler( async(req, res)=>{
    return res.status(200).json(
        new ApiResponse(200,req.user,"Current user fetched successfully")
    )
})
const updateAccountDetails = asyncHandler( async(req, res)=>{
    const {fullName, email} = req.body;
    if(!fullName || !email){
        throw new ApiError(400, "All Field is required");
    }
    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set:{
                fullName,email
            }
        },
        {new:true}
        ).select("-password");
    if(!user){
        throw new ApiError(500, "something went wrong");
    } 
    return res.status(200).json(
        new ApiResponse(200,user,"Account updated successfully")
    )   
})
const updateUserAvatar = asyncHandler(async(req, res)=>{
    const avatarLocalFile = req.file?.path;
    if(!avatarLocalFile){
        throw new ApiError(400, "Avatar file is missing");
    }
    const avatar = await uploadCloudinary(avatarLocalFile);
    if(!avatar){
        throw new ApiError(400, "Error while uploading avatar");
    }
    const oldAvatar = req.user?.avatar;
    await DeleteCloudinary(oldAvatar);
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                avatar: avatar.url
            }
        },
        {new:true}
        ).select("-password");
    if(!user){
        throw new ApiError(500, "something went wrong");
    } 
    return res.status(200).json(
        new ApiResponse(200,user,"Avatar updated successfully")
    )    
})
const updateUserCoverImage = asyncHandler(async(req, res)=>{
    const coverLocalFile = req.file?.path;
    if(!coverLocalFile){
        throw new ApiError(400, "Cover image file is missing");
    }
    const oldCoverImage = req.user?.coverImage;
    await DeleteCloudinary(oldCoverImage);
    const coverImage = await uploadCloudinary(coverLocalFile);
    if(!coverImage){
        throw new ApiError(400, "Error while uploading cover image");
    }
    const user = await User.findByIdAndUpdate(req.user?._id,
        {
            $set:{
                coverImage: coverImage.url
            }
        },
        {new:true}
        ).select("-password");
    if(!user){
        throw new ApiError(500, "something went wrong");
    } 
    return res.status(200).json(
        new ApiResponse(200,user,"Cover Image updated successfully")
    )    
})
const getUserChannelProfile = asyncHandler(async(req, res)=>{
    const {username} = req.params;
    if(!username?.trim()){
        throw new ApiError(400, "Username is missing");
    }
    const channel = await User.aggregate([
        {
            $match:{
                username : username?.toLowerCase()
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"channel",
                as:"subscribers"
            }
        },
        {
            $lookup:{
                from:"subscriptions",
                localField:"_id",
                foreignField:"subscriber",
                as:"subscribedTo"
            }
        },
        {
            $addFields:{
                subscriberCount : {
                    $size : "$subscribers"
                },
                channelSubscribedToCount : {
                    $size : "$subscribedTo"
                },
                isSubscribed:{
                    $cond:{
                        if:{$in:[req.user?._id, "$subscribers.subscriber"]},
                        then:true,
                        else:false
                    }
                }
            }
        },
        {
            $project:{
                fullName:1,
                username:1,
                subscriberCount:1,
                channelSubscribedToCount:1,
                isSubscribed:1,
                avatar:1,
                coverImage:1,
                email:1
            }
        }
    ]);
    if(!channel?.length){
        throw new ApiError(400, "channel dose not exists");
    }
    return res.status(200).json(
        new ApiResponse(200, channel[0], "user channel fetched successfully!")
    )
})
const getWatchHistory= asyncHandler(async(req, res)=>{
    const user = User.aggregate([
        {
            $match:{
                _id: new mongoose.Types.ObjectId(req.user._id)
            }
        },
        {
            $lookup:{
                from:'videos',
                localField:"watchHistory",
                foreignField:"_id",
                as:"watchHistory",
                pipeline:[
                    {
                        $lookup:{
                            from:"users",
                            localField:"owner",
                            foreignField:"_id",
                            as:"owner",
                            pipeline:[
                                {
                                    $project : {
                                        fullName:1,
                                        username:1,
                                        avatar:1
                                    }
                                }
                            ]
                        }
                    }
                ]
            }
        },
        {
            $addFields:{
                owner:{
                    $first:"$owner"
                }
            }
        }
    ])
    return res.status(200).json(
        new ApiResponse(200, user[0], "Watch History Successfully fetched!")
    )
})
export {
    registerUser,
    loginUser, 
    logoutUser, 
    refreshAccessToken, 
    changeCurrentPassword, 
    getCurrentUser, 
    updateAccountDetails,
    updateUserAvatar,
    updateUserCoverImage,
    getUserChannelProfile,
    getWatchHistory
}