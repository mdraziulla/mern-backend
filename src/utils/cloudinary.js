import {v2 as cloudinary} from "cloudinary";
import fs from "fs";
          
cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_SECRET_KEY
});

const uploadCloudinary = async (localFilePath)=>{
    try{
        if(!localFilePath) return null;
        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type:'auto'
        });
        // console.log("file is uploaded cloudinary ", response.url);
        fs.unlinkSync(localFilePath);
        return response;
    }catch(error){
        fs.unlinkSync(localFilePath); // remove the locally saved temporary file as the upload
    }
}
const DeleteCloudinary = async (localFilePath)=>{
    try{
        if(!localFilePath) return null;
        const response = await cloudinary.uploader.destroy(localFilePath,{resource_type:'auto'});
        return response;
    }catch(error){
        return error?.message || "Something went wrong";
    }
}
export {uploadCloudinary, DeleteCloudinary}