import { Schema, model, Document, Types } from 'mongoose';

export type GenerationType = 'image' | 'video';

export interface IGeneration extends Document {
  user: Types.ObjectId;
  mediaType: GenerationType;
  name: string;
  prompt: string;
  sourceParts: unknown[];
  quality?: 'standard' | 'high' | 'portrait';
  // Cloudinary URLs (preferred)
  imageUrl?: string; // Cloudinary URL for images
  thumbnailUrl?: string; // Cloudinary URL for thumbnails
  videoUrl?: string; // Cloudinary URL for videos (or external URL)
  // Legacy base64 fields (deprecated, kept for backward compatibility)
  base64?: string;
  mimeType?: string;
  thumbnailBase64?: string;
  // Cloudinary public IDs for management
  cloudinaryPublicId?: string;
  cloudinaryThumbnailPublicId?: string;
  videoModel?: 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';
  aspectRatio?: '16:9' | '9:16';
  resolution?: '720p' | '1080p';
  cost: number;
  createdAt: Date;
  updatedAt: Date;
}

const GenerationSchema = new Schema<IGeneration>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    mediaType: { type: String, enum: ['image', 'video'], required: true },
    name: { type: String, required: true },
    prompt: { type: String, required: true },
    sourceParts: { type: [Schema.Types.Mixed], default: [] },
    quality: { type: String, enum: ['standard', 'high', 'portrait'] },
    // Cloudinary URLs (preferred)
    imageUrl: { type: String },
    thumbnailUrl: { type: String },
    videoUrl: { type: String },
    cloudinaryPublicId: { type: String },
    cloudinaryThumbnailPublicId: { type: String },
    // Legacy base64 fields (deprecated)
    base64: { type: String },
    mimeType: { type: String },
    thumbnailBase64: { type: String },
    videoModel: { type: String, enum: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'] },
    aspectRatio: { type: String, enum: ['16:9', '9:16'] },
    resolution: { type: String, enum: ['720p', '1080p'] },
    cost: { type: Number, default: 0 },
  },
  { timestamps: true },
);

GenerationSchema.index({ user: 1, createdAt: -1 });

export const GenerationModel = model<IGeneration>('Generation', GenerationSchema);

