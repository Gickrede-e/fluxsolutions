import type { Role } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: Role;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  role: Role;
  jti: string;
  type: 'refresh';
}

export interface ShareVerificationPayload {
  shareId: string;
  token: string;
  type: 'share_verification';
}

export interface UploadTokenPayload {
  ownerId: string;
  filename: string;
  mime: string;
  size: number;
  folderId: string | null;
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  type: 'multipart_upload';
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'access' } satisfies AccessTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
  return jwt.sign({ ...payload, type: 'refresh' } satisfies RefreshTokenPayload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

export function signShareVerificationToken(
  payload: Omit<ShareVerificationPayload, 'type'>,
): string {
  return jwt.sign(
    { ...payload, type: 'share_verification' } satisfies ShareVerificationPayload,
    env.JWT_SHARE_SECRET,
    { expiresIn: env.SHARE_VERIFICATION_TTL_SECONDS },
  );
}

export function verifyShareVerificationToken(token: string): ShareVerificationPayload {
  return jwt.verify(token, env.JWT_SHARE_SECRET) as ShareVerificationPayload;
}

export function signUploadToken(payload: UploadTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.PRESIGNED_URL_EXPIRES_SECONDS });
}

export function verifyUploadToken(token: string): UploadTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as UploadTokenPayload;
}
