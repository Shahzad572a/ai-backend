import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Configure Cloudinary
cloudinary.config({
  cloud_name: env.cloudinaryCloudName,
  api_key: env.cloudinaryApiKey,
  api_secret: env.cloudinaryApiSecret,
});

export interface UploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  width?: number;
  height?: number;
  format?: string;
  bytes?: number;
}

/**
 * Upload base64 image to Cloudinary
 */
export const uploadImage = async (
  base64Data: string,
  folder: string = 'flowframe',
  options: {
    resourceType?: 'image' | 'video' | 'raw' | 'auto';
    transformation?: any[];
    publicId?: string;
    mimeType?: string;
  } = {}
): Promise<UploadResult> => {
  try {
    const { resourceType = 'image', transformation = [], publicId, mimeType } = options;

    // Remove data URL prefix if present
    const base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;

    const uploadOptions: any = {
      folder: `flowframe/${folder}`,
      resource_type: resourceType,
      overwrite: false,
      use_filename: true,
      unique_filename: true,
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    if (transformation.length > 0) {
      uploadOptions.transformation = transformation;
    }

    const effectiveMimeType =
      mimeType ||
      (resourceType === 'video'
        ? 'video/mp4'
        : resourceType === 'image'
        ? 'image/jpeg'
        : 'application/octet-stream');

    const result = await cloudinary.uploader.upload(`data:${effectiveMimeType};base64,${base64String}`, uploadOptions);

    logger.info(`Uploaded to Cloudinary: ${result.public_id}`);

    return {
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error: any) {
    logger.error(`Cloudinary upload error: ${error.message}`, error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
};

/**
 * Upload video to Cloudinary
 */
export const uploadVideo = async (
  base64Data: string,
  folder: string = 'flowframe/videos',
  options: {
    publicId?: string;
    transformation?: any[];
    mimeType?: string;
  } = {}
): Promise<UploadResult> => {
  return uploadImage(base64Data, folder, {
    resourceType: 'video',
    mimeType: options.mimeType || 'video/mp4',
    ...options,
  });
};

/**
 * Generate thumbnail URL from Cloudinary public ID
 */
export const getThumbnailUrl = (
  publicId: string,
  options: {
    width?: number;
    height?: number;
    crop?: string;
    quality?: number;
  } = {}
): string => {
  const { width = 300, height = 300, crop = 'fill', quality = 80 } = options;
  
  return cloudinary.url(publicId, {
    resource_type: 'image',
    transformation: [
      { width, height, crop, quality },
    ],
  });
};

/**
 * Delete file from Cloudinary
 */
export const deleteFile = async (publicId: string, resourceType: 'image' | 'video' = 'image'): Promise<void> => {
  try {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    logger.info(`Deleted from Cloudinary: ${publicId}`);
  } catch (error: any) {
    logger.error(`Cloudinary delete error: ${error.message}`, error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
  }
};

/**
 * Upload image with automatic thumbnail generation
 */
export const uploadImageWithThumbnail = async (
  base64Data: string,
  folder: string = 'flowframe',
  thumbnailOptions: {
    width?: number;
    height?: number;
  } = {}
): Promise<{ image: UploadResult; thumbnail: UploadResult }> => {
  const image = await uploadImage(base64Data, folder);
  
  // Generate thumbnail using Cloudinary transformations
  const thumbnailUrl = getThumbnailUrl(image.publicId, {
    width: thumbnailOptions.width || 300,
    height: thumbnailOptions.height || 300,
    crop: 'fill',
    quality: 80,
  });

  return {
    image,
    thumbnail: {
      publicId: image.publicId,
      url: thumbnailUrl,
      secureUrl: thumbnailUrl.replace('http://', 'https://'),
      width: thumbnailOptions.width || 300,
      height: thumbnailOptions.height || 300,
    },
  };
};

