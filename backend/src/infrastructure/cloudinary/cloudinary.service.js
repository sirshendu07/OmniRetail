import { cloudinary } from '../../config/cloudinary.config.js';
import { env } from '../../config/env.config.js';
import { logger } from '../../common/utils/logger.js';
import { AppError } from '../../common/errors/AppError.js';

const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp']);

/**
 * Generates an HMAC-SHA1 upload signature for authenticated frontend uploads.
 */
export function generateUploadSignature(folder = 'omni-retail/products') {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    env.CLOUDINARY_API_SECRET
  );
  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder
  };
}

/**
 * Uploads a base64 or buffer image to Cloudinary with automated format optimization.
 */
export async function uploadImage(fileData, folder = 'omni-retail/products') {
  if (process.env.NODE_ENV === 'test' || !env.CLOUDINARY_API_KEY) {
    return {
      url: 'https://res.cloudinary.com/sanju/image/upload/v1/mock-product.jpg',
      secureUrl: 'https://res.cloudinary.com/sanju/image/upload/v1/mock-product.jpg',
      publicId: 'omni-retail/products/mock-product-id'
    };
  }

  try {
    const result = await cloudinary.uploader.upload(fileData, {
      folder,
      resource_type: 'image',
      transformation: [{ quality: 'auto', fetch_format: 'auto' }]
    });
    return {
      url: result.url,
      secureUrl: result.secure_url,
      publicId: result.public_id
    };
  } catch (err) {
    logger.error({ err: err.message }, 'Cloudinary image upload failed');
    throw new AppError('Failed to upload product image to Cloudinary', 500);
  }
}

/**
 * Deletes an image asset from Cloudinary using its public ID.
 */
export async function deleteImage(publicId) {
  if (process.env.NODE_ENV === 'test' || !publicId || !env.CLOUDINARY_API_KEY) {
    return true;
  }
  try {
    await cloudinary.uploader.destroy(publicId);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, publicId }, 'Failed to delete asset from Cloudinary');
    return false;
  }
}
