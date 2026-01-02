import { Schema, model, Document } from 'mongoose';

export type PromptCategory = 'rooms' | 'lighting' | 'outdoor' | 'artwork' | 'interaction' | 'custom';

export interface CustomPrompt {
  label: string;
  prompt: string;
  category: PromptCategory | string;
}

export interface UserSettings {
  selectedPricingTier: string;
  outputQuality: 'standard' | 'high' | 'portrait';
  selectedVideoModel: 'veo-3.1-fast-generate-preview' | 'veo-3.1-generate-preview';
  selectedVideoAspectRatio: '16:9' | '9:16';
}

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string;
  provider: 'local' | 'google';
  googleUid?: string;
  balance: number;
  customPrompts: CustomPrompt[];
  settings: UserSettings;
  lastLoginAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const CustomPromptSchema = new Schema<CustomPrompt>(
  {
    label: { type: String, required: true },
    prompt: { type: String, required: true },
    category: { type: String, default: 'custom' },
  },
  { _id: false },
);

const UserSettingsSchema = new Schema<UserSettings>(
  {
    selectedPricingTier: { type: String, default: '10' },
    outputQuality: { type: String, enum: ['standard', 'high', 'portrait'], default: 'standard' },
    selectedVideoModel: {
      type: String,
      enum: ['veo-3.1-fast-generate-preview', 'veo-3.1-generate-preview'],
      default: 'veo-3.1-fast-generate-preview',
    },
    selectedVideoAspectRatio: { type: String, enum: ['16:9', '9:16'], default: '16:9' },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, index: true },
    passwordHash: { type: String },
    provider: { type: String, enum: ['local', 'google'], default: 'local' },
    googleUid: { type: String, index: true },
    balance: { type: Number, default: 0 },
    customPrompts: { type: [CustomPromptSchema], default: [] },
    settings: { type: UserSettingsSchema, default: () => ({}) },
    lastLoginAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const UserModel = model<IUser>('User', UserSchema);

