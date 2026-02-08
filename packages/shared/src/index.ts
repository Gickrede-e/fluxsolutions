import { z } from 'zod';

export const FLUXSOLUTIONS_BRAND = 'fluxsolutions';

export const DEFAULT_MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_MULTIPART_PART_SIZE_BYTES = 8 * 1024 * 1024;
export const MAX_MULTIPART_PARTS = 10_000;

export const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
  'application/json',
  'video/mp4',
] as const;

export const userRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof userRoleSchema>;

export const scanStatusSchema = z.enum(['PENDING', 'CLEAN', 'INFECTED', 'DISABLED']);
export type ScanStatus = z.infer<typeof scanStatusSchema>;

export const shareCreateSchema = z.object({
  fileId: z.string().cuid(),
  password: z.string().min(6).max(128).optional(),
  expiresAt: z.string().datetime().optional(),
  oneTime: z.boolean().optional().default(false),
  maxDownloads: z.number().int().positive().optional(),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export const fileRenameMoveSchema = z.object({
  filename: z.string().min(1).max(255).optional(),
  folderId: z.string().cuid().nullable().optional(),
});

export const folderCreateSchema = z.object({
  name: z.string().min(1).max(120),
});

export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function sanitizeFilename(raw: string): string {
  return raw
    .replace(/[\\/]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .trim()
    .slice(0, 255);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export function splitCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}
