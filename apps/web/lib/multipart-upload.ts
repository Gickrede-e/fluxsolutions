import { apiFetch } from './api';

interface InitiateResponse {
  uploadToken: string;
  uploadId: string;
  key: string;
  partSize: number;
  partCount: number;
  parts: Array<{ partNumber: number; url: string }>;
}

interface ResumeResponse {
  uploadToken: string;
  uploadId: string;
  key: string;
  partSize: number;
  partCount: number;
  parts: Array<{ partNumber: number; url: string }>;
}

interface UploadSessionState {
  uploadToken: string;
  uploadId: string;
  key: string;
  partSize: number;
  partCount: number;
  fileFingerprint: string;
  uploadedParts: Record<number, string>;
}

function sessionStorageKey(fingerprint: string): string {
  return `fluxsolutions-upload:${fingerprint}`;
}

function createFingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.type}:${file.lastModified}`;
}

function saveSession(session: UploadSessionState): void {
  localStorage.setItem(sessionStorageKey(session.fileFingerprint), JSON.stringify(session));
}

function readSession(fingerprint: string): UploadSessionState | null {
  const raw = localStorage.getItem(sessionStorageKey(fingerprint));
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as UploadSessionState;
  } catch {
    return null;
  }
}

function clearSession(fingerprint: string): void {
  localStorage.removeItem(sessionStorageKey(fingerprint));
}

async function putPart(url: string, blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag') || xhr.getResponseHeader('etag');
        if (!etag) {
          reject(new Error('Missing ETag in upload part response'));
          return;
        }

        resolve(etag);
        return;
      }

      reject(new Error(`Failed to upload part: HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during part upload'));
    xhr.send(blob);
  });
}

export async function uploadFileResumable(input: {
  file: File;
  folderId?: string | null;
  onProgress?: (progress: number) => void;
}): Promise<void> {
  const { file } = input;
  const fingerprint = createFingerprint(file);

  let session = readSession(fingerprint);

  if (!session) {
    const initiated = await apiFetch<InitiateResponse>('/files/initiate-upload', {
      method: 'POST',
      body: JSON.stringify({
        filename: file.name,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        folderId: input.folderId ?? null,
      }),
    });

    session = {
      uploadToken: initiated.uploadToken,
      uploadId: initiated.uploadId,
      key: initiated.key,
      partSize: initiated.partSize,
      partCount: initiated.partCount,
      fileFingerprint: fingerprint,
      uploadedParts: {},
    };

    saveSession(session);
  }

  const uploadedPartNumbers = new Set(
    Object.keys(session.uploadedParts).map((partNumber) => Number(partNumber)),
  );

  const missingPartNumbers = Array.from({ length: session.partCount }, (_, index) => index + 1).filter(
    (partNumber) => !uploadedPartNumbers.has(partNumber),
  );

  let partUrlMap = new Map<number, string>();

  if (missingPartNumbers.length > 0) {
    const resumed = await apiFetch<ResumeResponse>('/files/resume-upload', {
      method: 'POST',
      body: JSON.stringify({
        uploadToken: session.uploadToken,
        partNumbers: missingPartNumbers,
      }),
    });

    partUrlMap = new Map(resumed.parts.map((part) => [part.partNumber, part.url]));
  }

  const totalParts = session.partCount;
  const uploadedCountInitial = Object.keys(session.uploadedParts).length;

  for (const partNumber of missingPartNumbers) {
    const start = (partNumber - 1) * session.partSize;
    const end = Math.min(start + session.partSize, file.size);
    const chunk = file.slice(start, end);
    const uploadUrl = partUrlMap.get(partNumber);

    if (!uploadUrl) {
      throw new Error(`Missing presigned URL for part ${partNumber}`);
    }

    const eTag = await putPart(uploadUrl, chunk);
    session.uploadedParts[partNumber] = eTag;
    saveSession(session);

    const uploadedNow = uploadedCountInitial + Object.keys(session.uploadedParts).length - uploadedCountInitial;
    const progress = Math.round((uploadedNow / totalParts) * 100);
    input.onProgress?.(progress);
  }

  const completedParts = Object.entries(session.uploadedParts)
    .map(([partNumber, eTag]) => ({
      partNumber: Number(partNumber),
      eTag,
    }))
    .sort((a, b) => a.partNumber - b.partNumber);

  await apiFetch<{ file: unknown }>('/files/complete-upload', {
    method: 'POST',
    body: JSON.stringify({
      uploadToken: session.uploadToken,
      parts: completedParts,
    }),
  });

  clearSession(fingerprint);
  input.onProgress?.(100);
}
