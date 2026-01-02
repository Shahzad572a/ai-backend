import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';

export interface JwtPayload {
  sub: string;
  email: string;
}

export const signToken = (payload: JwtPayload, expiresIn: SignOptions['expiresIn'] = '7d'): string => {
  const options: SignOptions = { expiresIn };
  return jwt.sign(payload, env.jwtSecret, options);
};

