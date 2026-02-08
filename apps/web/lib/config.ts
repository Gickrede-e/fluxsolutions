import { FLUXSOLUTIONS_BRAND } from '@fluxsolutions/shared';

export const BRAND = FLUXSOLUTIONS_BRAND;
// Use same-origin `/api` by default so production builds work without NEXT_PUBLIC build-time injection.
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api';
export const MAX_FILE_SIZE_BYTES = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE_BYTES ?? 1_073_741_824);
