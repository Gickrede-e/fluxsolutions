import { describe, expect, it } from 'vitest';
import { evaluateShareAvailability } from '../../src/lib/share-policy.js';

describe('evaluateShareAvailability', () => {
  it('returns available when share is valid', () => {
    const result = evaluateShareAvailability(
      {
        expiresAt: null,
        maxDownloads: null,
        downloadsCount: 0,
        oneTime: false,
      },
      {
        deletedAt: null,
        scanStatus: 'CLEAN',
      },
    );

    expect(result).toEqual({ available: true, reason: 'ok' });
  });

  it('returns expired for outdated share', () => {
    const result = evaluateShareAvailability(
      {
        expiresAt: new Date(Date.now() - 1_000),
        maxDownloads: null,
        downloadsCount: 0,
        oneTime: false,
      },
      {
        deletedAt: null,
        scanStatus: 'CLEAN',
      },
    );

    expect(result).toEqual({ available: false, reason: 'expired' });
  });

  it('returns pending scan state', () => {
    const result = evaluateShareAvailability(
      {
        expiresAt: null,
        maxDownloads: null,
        downloadsCount: 0,
        oneTime: false,
      },
      {
        deletedAt: null,
        scanStatus: 'PENDING',
      },
    );

    expect(result).toEqual({ available: false, reason: 'file_pending_scan' });
  });
});
