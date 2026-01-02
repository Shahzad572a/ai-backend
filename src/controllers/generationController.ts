import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { GenerationModel } from '../models/Generation';
import { UserModel } from '../models/User';
import { logger } from '../utils/logger';
import { Types } from 'mongoose';
import { uploadImage, uploadImageWithThumbnail, uploadVideo } from '../services/cloudinaryService';

export const createGenerationController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const {
      mediaType,
      name,
      prompt,
      sourceParts,
      quality,
      base64,
      mimeType,
      thumbnailBase64,
      videoUrl,
      videoModel,
      aspectRatio,
      resolution,
      cost,
    } = req.body;

    if (!mediaType || !name || !prompt || cost === undefined) {
      return res.status(400).json({ message: 'mediaType, name, prompt, and cost are required' });
    }

    // Verify user exists and has sufficient balance
    const user = await UserModel.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const costInPounds = cost / 1000; // cost is in smallest currency units
    if (user.balance < costInPounds) {
      return res.status(400).json({ message: 'Insufficient balance' });
    }

    // Deduct cost from user balance
    user.balance -= costInPounds;
    await user.save();

    // Upload to Cloudinary if base64 data is provided
    let imageUrl: string | undefined;
    let thumbnailUrl: string | undefined;
    let cloudinaryPublicId: string | undefined;
    let cloudinaryThumbnailPublicId: string | undefined;
    let finalVideoUrl: string | undefined = videoUrl;

    try {
      if (mediaType === 'image' && base64) {
        // Upload image with thumbnail
        const uploadResult = await uploadImageWithThumbnail(
          base64,
          'generations',
          { width: 300, height: 300 }
        );
        imageUrl = uploadResult.image.secureUrl;
        thumbnailUrl = uploadResult.thumbnail.secureUrl;
        cloudinaryPublicId = uploadResult.image.publicId;
        cloudinaryThumbnailPublicId = uploadResult.image.publicId; // Same public ID, different transformation
        logger.info(`Uploaded image to Cloudinary: ${cloudinaryPublicId}`);
      } else if (mediaType === 'video' && base64) {
        // Upload video
        const uploadResult = await uploadVideo(base64, 'generations/videos', { mimeType: mimeType || 'video/mp4' });
        finalVideoUrl = uploadResult.secureUrl;
        cloudinaryPublicId = uploadResult.publicId;
        // Generate thumbnail for video
        if (thumbnailBase64) {
          const thumbResult = await uploadImage(thumbnailBase64, 'generations/thumbnails');
          thumbnailUrl = thumbResult.secureUrl;
          cloudinaryThumbnailPublicId = thumbResult.publicId;
        }
        logger.info(`Uploaded video to Cloudinary: ${cloudinaryPublicId}`);
      } else if (mediaType === 'video' && videoUrl && thumbnailBase64) {
        // External video URL, but upload thumbnail
        const thumbResult = await uploadImage(thumbnailBase64, 'generations/thumbnails');
        thumbnailUrl = thumbResult.secureUrl;
        cloudinaryThumbnailPublicId = thumbResult.publicId;
        logger.info(`Uploaded video thumbnail to Cloudinary: ${cloudinaryThumbnailPublicId}`);
      }
    } catch (uploadError: any) {
      logger.error(`Cloudinary upload failed: ${uploadError.message}`, uploadError);
      // Continue with base64 fallback if Cloudinary fails
      logger.warn('Falling back to base64 storage due to Cloudinary upload failure');
    }

    // Create generation record
    const generation = new GenerationModel({
      user: req.user.id,
      mediaType,
      name,
      prompt,
      sourceParts: sourceParts || [],
      quality,
      // Cloudinary URLs (preferred)
      imageUrl,
      thumbnailUrl,
      videoUrl: finalVideoUrl,
      cloudinaryPublicId,
      cloudinaryThumbnailPublicId,
      // Legacy base64 fields (fallback)
      base64: imageUrl ? undefined : base64, // Only store base64 if Cloudinary upload failed
      mimeType,
      thumbnailBase64: thumbnailUrl ? undefined : thumbnailBase64, // Only store if Cloudinary upload failed
      videoModel,
      aspectRatio,
      resolution,
      cost,
    });

    await generation.save();

    logger.info(`Generation created for user ${req.user.id}: ${generation._id}`);

    res.status(201).json({
      id: generation._id.toString(),
      ...generation.toObject(),
      user: undefined, // Don't send user object
    });
  } catch (error) {
    next(error);
  }
};

export const getGenerationsController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const requestId = Date.now().toString();
  const startTime = Date.now();
  
  try {
    logger.info(`[${requestId}] Starting getGenerationsController for user ${req.user?.id}`);
    
    if (!req.user) {
      logger.warn(`[${requestId}] Unauthorized request`);
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { mediaType, limit = 50, skip = 0, includeFullData } = req.query;
    const safeLimit = Math.min(Number(limit) || 50, 100);
    const safeSkip = Number(skip) || 0;

    logger.info(`[${requestId}] Query params: mediaType=${mediaType}, limit=${safeLimit}, skip=${safeSkip}, includeFullData=${includeFullData}`);

    // Build query - ensure user ID is properly formatted as ObjectId
    let userId: Types.ObjectId;
    try {
      userId = new Types.ObjectId(req.user.id);
    } catch (error) {
      logger.error(`[${requestId}] Invalid user ID format: ${req.user.id}`);
      return res.status(400).json({ message: 'Invalid user ID format' });
    }
    
    const query: any = { user: userId };
    if (mediaType) {
      query.mediaType = mediaType;
    }

    logger.info(`[${requestId}] Query built: ${JSON.stringify(query)}`);

    // Use explicit field selection for better performance
    // MongoDB projection: you can only use inclusion (1) OR exclusion (0), not both
    // We'll use inclusion projection - only include fields we need
    const projection: any = {
      _id: 1,
      user: 1,
      mediaType: 1,
      name: 1,
      prompt: 1,
      quality: 1,
      mimeType: 1,
      thumbnailBase64: 1, // Include thumbnail for list views
      videoUrl: 1,
      videoModel: 1,
      aspectRatio: 1,
      resolution: 1,
      cost: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    // Only include very large fields if explicitly requested
    // base64 and sourceParts can be very large, so exclude by default
    if (includeFullData === 'true') {
      projection.base64 = 1;
      projection.sourceParts = 1;
    }

    logger.info(`[${requestId}] Starting database query...`);
    const queryStartTime = Date.now();

    // First, test if we can even count documents (quick test)
    try {
      const countStart = Date.now();
      const totalCount = await GenerationModel.countDocuments(query).maxTimeMS(5000);
      const countTime = Date.now() - countStart;
      logger.info(`[${requestId}] Count query took ${countTime}ms, found ${totalCount} total documents`);
    } catch (countError: any) {
      logger.error(`[${requestId}] Count query failed: ${countError.message}`);
      // Continue anyway, might be a timeout
    }

    // Execute query with explicit projection and timeout
    logger.info(`[${requestId}] Executing find query with projection: ${JSON.stringify(projection)}`);
    logger.info(`[${requestId}] Query object: ${JSON.stringify(query)}`);
    const findStartTime = Date.now();
    
    try {
      logger.info(`[${requestId}] Using projection object: ${JSON.stringify(projection)}`);
      
      // Use .find() with .select() string format - now using Cloudinary URLs instead of base64
      // Cloudinary URLs are small strings, so no timeout issues
      let selectString = '_id user mediaType name prompt quality mimeType imageUrl thumbnailUrl videoUrl videoModel aspectRatio resolution cost createdAt updatedAt';
      
      // Include sourceParts if full data is requested
      if (includeFullData === 'true') {
        selectString += ' sourceParts base64'; // Include base64 as fallback
      }
      // Note: We no longer need to exclude thumbnailBase64 since we use thumbnailUrl from Cloudinary
      
      logger.info(`[${requestId}] Using select string: ${selectString}`);
      
      // Build query with string-based select - more reliable for large documents
      const queryBuilder = GenerationModel.find(query)
        .select(selectString)
        .sort({ createdAt: -1 })
        .limit(safeLimit)
        .skip(safeSkip)
        .maxTimeMS(10000) // 10 second timeout
        .lean(); // Use lean() for better performance
      
      logger.info(`[${requestId}] Query builder created, executing...`);
      
      // Execute query with explicit timeout protection
      const queryPromise = queryBuilder.exec();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout after 12 seconds')), 12000);
      });
      
      const generations = await Promise.race([queryPromise, timeoutPromise]) as any[];
      
      const findTime = Date.now() - findStartTime;
      logger.info(`[${requestId}] Find query completed in ${findTime}ms, found ${generations.length} items`);
      
      const queryTime = Date.now() - queryStartTime;
      logger.info(`[${requestId}] Total database query time: ${queryTime}ms`);

      // Convert MongoDB _id to id for frontend compatibility
      logger.info(`[${requestId}] Formatting ${generations.length} generations...`);
      const formatStartTime = Date.now();
      
      const formattedGenerations = generations.map((gen: any) => {
        const formatted: any = {
          id: gen._id.toString(),
          user: gen.user?.toString(),
          mediaType: gen.mediaType,
          name: gen.name || 'Untitled',
          prompt: gen.prompt || '',
          quality: gen.quality,
          mimeType: gen.mimeType,
          // Cloudinary URLs (preferred)
          imageUrl: gen.imageUrl || null,
          thumbnailUrl: gen.thumbnailUrl || null,
          videoUrl: gen.videoUrl || null,
          // Legacy base64 fields (fallback for old data)
          base64: gen.base64 || null,
          thumbnailBase64: gen.thumbnailBase64 || null,
          videoModel: gen.videoModel,
          aspectRatio: gen.aspectRatio,
          resolution: gen.resolution,
          cost: gen.cost || 0,
          createdAt: gen.createdAt,
          updatedAt: gen.updatedAt,
        };
        
        // Include sourceParts if requested
        if (includeFullData === 'true') {
          formatted.sourceParts = gen.sourceParts || null;
        } else {
          formatted.sourceParts = null;
        }
        
        return formatted;
      });

      const formatTime = Date.now() - formatStartTime;
      const totalTime = Date.now() - startTime;
      
      logger.info(`[${requestId}] Formatting took ${formatTime}ms, total time: ${totalTime}ms`);
      logger.info(`[${requestId}] Sending response with ${formattedGenerations.length} items`);

      res.status(200).json(formattedGenerations);
      
      logger.info(`[${requestId}] Response sent successfully`);
      return;
    } catch (findError: any) {
      const findTime = Date.now() - findStartTime;
      logger.error(`[${requestId}] Find query failed after ${findTime}ms: ${findError.message}`, {
        error: findError.message,
        name: findError.name,
        stack: findError.stack,
      });
      throw findError;
    }
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

export const getGenerationController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const generation = await GenerationModel.findOne({ _id: id, user: req.user.id }).lean();

    if (!generation) {
      return res.status(404).json({ message: 'Generation not found' });
    }

    res.status(200).json({
      ...generation,
      id: generation._id.toString(),
      _id: undefined,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteGenerationController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;

    const generation = await GenerationModel.findOneAndDelete({ _id: id, user: req.user.id });

    if (!generation) {
      return res.status(404).json({ message: 'Generation not found' });
    }

    logger.info(`Generation deleted for user ${req.user.id}: ${id}`);

    res.status(200).json({ message: 'Generation deleted successfully' });
  } catch (error) {
    next(error);
  }
};

export const getGenerationStatsController = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const stats = await GenerationModel.aggregate([
      { $match: { user: req.user.id } },
      {
        $group: {
          _id: null,
          totalGenerations: { $sum: 1 },
          totalCost: { $sum: '$cost' },
          imageCount: {
            $sum: { $cond: [{ $eq: ['$mediaType', 'image'] }, 1, 0] },
          },
          videoCount: {
            $sum: { $cond: [{ $eq: ['$mediaType', 'video'] }, 1, 0] },
          },
        },
      },
    ]);

    const result = stats[0] || {
      totalGenerations: 0,
      totalCost: 0,
      imageCount: 0,
      videoCount: 0,
    };

    res.status(200).json({
      ...result,
      totalCostInPounds: result.totalCost / 1000,
    });
  } catch (error) {
    next(error);
  }
};

