import { FLUXSOLUTIONS_BRAND } from '@fluxsolutions/shared';

export const BRAND = FLUXSOLUTIONS_BRAND;
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';
export const MAX_FILE_SIZE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_BYTES ?? 1_073_741_824);
