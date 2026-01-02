import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { ArtworkModel } from '../models/Artwork';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';
import { uploadImage } from '../services/cloudinaryService';

export const createArtworkController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { name, base64, mimeType, category = 'primary', sizeKB, dimensions, tags = [] } = req.body;

    if (!name || !base64 || !mimeType) {
      return res.status(400).json({ message: 'name, base64, and mimeType are required' });
    }

    // Verify user exists
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Upload to Cloudinary
    let imageUrl: string;
    let cloudinaryPublicId: string;

    try {
      const uploadResult = await uploadImage(base64, 'artworks');
      imageUrl = uploadResult.secureUrl;
      cloudinaryPublicId = uploadResult.publicId;
      logger.info(`Uploaded artwork to Cloudinary: ${cloudinaryPublicId}`);
    } catch (uploadError: any) {
      logger.error(`Cloudinary upload failed: ${uploadError.message}`, uploadError);
      return res.status(500).json({ message: 'Failed to upload image to Cloudinary' });
    }

    // Create artwork record
    const artwork = new ArtworkModel({
      user: req.user.id,
      category,
      name,
      imageUrl, // Cloudinary URL (required)
      cloudinaryPublicId, // Cloudinary public ID (required)
      base64: undefined, // Don't store base64 anymore
      mimeType,
      sizeKB,
      dimensions,
      tags,
      isGenerated: false, // User uploaded artwork
    });

    await artwork.save();

    logger.info(`Artwork created for user ${req.user.id}: ${artwork._id}`);

    res.status(201).json({
      id: artwork._id.toString(),
      name: artwork.name,
      imageUrl: artwork.imageUrl, // Cloudinary URL
      base64: artwork.base64 || null, // Legacy fallback
      mimeType: artwork.mimeType,
      category: artwork.category,
      sizeKB: artwork.sizeKB,
      dimensions: artwork.dimensions,
      tags: artwork.tags,
      createdAt: artwork.createdAt,
      updatedAt: artwork.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

export const getArtworksController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString();
  const startTime = Date.now();
  
  try {
    logger.info(`[${requestId}] Starting getArtworksController for user ${req.user?.id}`);
    
    if (!req.user) {
      logger.warn(`[${requestId}] Unauthorized request`);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { category } = req.query;
    logger.info(`[${requestId}] Query params: category=${category}`);

    const query: any = { user: req.user.id };
    if (category) {
      query.category = category;
    }

    logger.info(`[${requestId}] Query built: ${JSON.stringify(query)}`);
    logger.info(`[${requestId}] Starting database query...`);

    // Use simple find query - Exclude base64 to avoid timeout with old data
    // Only include imageUrl (Cloudinary URL) which is a small string
    const queryBuilder = ArtworkModel.find(query)
      .select('_id name imageUrl mimeType category sizeKB dimensions tags createdAt updatedAt')
      .sort({ createdAt: -1 })
      .maxTimeMS(10000)
      .lean();

    logger.info(`[${requestId}] Query builder created, executing...`);
    
    // Execute query with timeout protection
    const queryPromise = queryBuilder.exec();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Query timeout after 12 seconds')), 12000);
    });
    
    const artworks = await Promise.race([queryPromise, timeoutPromise]) as any[];

    const queryTime = Date.now() - startTime;
    logger.info(`[${requestId}] Query completed in ${queryTime}ms, found ${artworks.length} items`);

    res.status(200).json(
      artworks.map((artwork) => ({
        id: artwork._id.toString(),
        name: artwork.name,
        imageUrl: artwork.imageUrl, // Cloudinary URL (preferred)
        base64: artwork.base64 || null, // Legacy fallback
        mimeType: artwork.mimeType,
        category: artwork.category,
        sizeKB: artwork.sizeKB,
        dimensions: artwork.dimensions,
        tags: artwork.tags,
        createdAt: artwork.createdAt,
        updatedAt: artwork.updatedAt,
      })),
    );
    
    logger.info(`[${requestId}] Response sent successfully`);
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    logger.error(`[${requestId}] Error after ${totalTime}ms: ${error.message}`, {
      error: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    if (error.name === 'MongoTimeoutError' || error.message.includes('timeout')) {
      return res.status(504).json({ 
        message: 'Request timeout. The database query took too long.',
        requestId 
      });
    }
    
    if (error.name === 'MongoServerError' || error.name === 'MongoError') {
      logger.error(`[${requestId}] MongoDB error: ${error.message}`);
      return res.status(500).json({ 
        message: 'Database error occurred.',
        requestId 
      });
    }
    
    next(error);
  }
};

export const deleteArtworkController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const artwork = await ArtworkModel.findOne({ _id: id, user: req.user.id });
    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    await artwork.deleteOne();

    logger.info(`Artwork deleted: ${id} for user ${req.user.id}`);

    res.status(200).json({ message: 'Artwork deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const updateArtworkController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { name, category, tags } = req.body;

    const artwork = await ArtworkModel.findOne({ _id: id, user: req.user.id });
    if (!artwork) {
      return res.status(404).json({ message: 'Artwork not found' });
    }

    if (name !== undefined) artwork.name = name;
    if (category !== undefined) artwork.category = category;
    if (tags !== undefined) artwork.tags = tags;

    await artwork.save();

    res.status(200).json({
      id: artwork._id.toString(),
      name: artwork.name,
      base64: artwork.base64,
      mimeType: artwork.mimeType,
      category: artwork.category,
      sizeKB: artwork.sizeKB,
      dimensions: artwork.dimensions,
      tags: artwork.tags,
      createdAt: artwork.createdAt,
      updatedAt: artwork.updatedAt,
    });
  } catch (error) {
    next(error);
  }
};

