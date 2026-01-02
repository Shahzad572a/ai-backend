import { Schema, model, Document, Types } from 'mongoose';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';
export type PaymentProvider = 'paypal' | 'stripe' | 'manual';

export interface IPayment extends Document {
  user: Types.ObjectId;
  provider: PaymentProvider;
  amount: number;
  currency: string;
  status: PaymentStatus;
  externalId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['paypal', 'stripe', 'manual'], required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'GBP' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    externalId: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

PaymentSchema.index({ provider: 1, externalId: 1 }, { unique: true, sparse: true });

export const PaymentModel = model<IPayment>('Payment', PaymentSchema);

