import type { File, Share } from '@prisma/client';

export type ShareAvailabilityReason =
  | 'ok'
  | 'expired'
  | 'download_limit_reached'
  | 'one_time_consumed'
  | 'file_deleted'
  | 'file_pending_scan'
  | 'file_infected';

export function evaluateShareAvailability(
  share: Pick<Share, 'expiresAt' | 'maxDownloads' | 'downloadsCount' | 'oneTime'>,
  file: Pick<File, 'deletedAt' | 'scanStatus'>,
): { available: boolean; reason: ShareAvailabilityReason } {
  if (file.deletedAt) {
    return { available: false, reason: 'file_deleted' };
  }

  if (file.scanStatus === 'PENDING') {
    return { available: false, reason: 'file_pending_scan' };
  }

  if (file.scanStatus === 'INFECTED') {
    return { available: false, reason: 'file_infected' };
  }

  const now = new Date();

  if (share.expiresAt && share.expiresAt < now) {
    return { available: false, reason: 'expired' };
  }

  if (share.oneTime && share.downloadsCount >= 1) {
    return { available: false, reason: 'one_time_consumed' };
  }

  if (share.maxDownloads && share.downloadsCount >= share.maxDownloads) {
    return { available: false, reason: 'download_limit_reached' };
  }

  return { available: true, reason: 'ok' };
}
