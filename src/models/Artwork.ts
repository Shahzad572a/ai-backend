import { Schema, model, Document, Types } from 'mongoose';

export type ArtworkCategory = 'primary' | 'holding' | 'looking' | 'room';

export interface ArtworkDimensions {
  width: number;
  height: number;
}

export interface IArtwork extends Document {
  user: Types.ObjectId;
  category: ArtworkCategory;
  name: string;
  // Cloudinary URLs (preferred)
  imageUrl: string; // Cloudinary URL
  cloudinaryPublicId: string; // Cloudinary public ID for management
  // Legacy base64 field (deprecated, kept for backward compatibility)
  base64?: string;
  mimeType: string;
  sizeKB?: number;
  dimensions?: ArtworkDimensions;
  sourcePrompt?: string;
  tags: string[];
  isGenerated: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ArtworkSchema = new Schema<IArtwork>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    category: {
      type: String,
      enum: ['primary', 'holding', 'looking', 'room'],
      default: 'primary',
      index: true,
    },
    name: { type: String, required: true },
    // Cloudinary URLs (preferred)
    imageUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String, required: true },
    // Legacy base64 field (deprecated)
    base64: { type: String },
    mimeType: { type: String, required: true },
    sizeKB: { type: Number },
    dimensions: {
      width: { type: Number },
      height: { type: Number },
    },
    sourcePrompt: { type: String },
    tags: { type: [String], default: [] },
    isGenerated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const ArtworkModel = model<IArtwork>('Artwork', ArtworkSchema);

