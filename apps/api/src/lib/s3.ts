import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';
import { Readable } from 'node:stream';
import { env } from '../config/env.js';

const credentials = {
  accessKeyId: env.S3_ACCESS_KEY,
  secretAccessKey: env.S3_SECRET_KEY,
};

const s3ControlClient = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  credentials,
  forcePathStyle: env.s3ForcePathStyle,
});

const s3SigningClient = new S3Client({
  region: env.S3_REGION,
  endpoint: env.s3PublicEndpoint,
  credentials,
  forcePathStyle: env.s3ForcePathStyle,
});

function toReadable(body: unknown): Readable {
  if (!body) {
    throw new Error('S3 body is empty');
  }

  if (body instanceof Readable) {
    return body;
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToWebStream' in body &&
    typeof (body as { transformToWebStream?: () => ReadableStream<Uint8Array> }).transformToWebStream ===
      'function'
  ) {
    const webStream = (
      body as {
        transformToWebStream: () => ReadableStream<Uint8Array>;
      }
    ).transformToWebStream();

    return Readable.fromWeb(webStream as unknown as import('node:stream/web').ReadableStream);
  }

  if (
    typeof body === 'object' &&
    body !== null &&
    Symbol.asyncIterator in body &&
    typeof (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function'
  ) {
    return Readable.from(body as AsyncIterable<Uint8Array>);
  }

  throw new Error('S3 body is not readable');
}

export async function ensureBucketExists(): Promise<void> {
  try {
    await s3ControlClient.send(
      new HeadBucketCommand({
        Bucket: env.S3_BUCKET,
      }),
    );
  } catch {
    await s3ControlClient.send(
      new CreateBucketCommand({
        Bucket: env.S3_BUCKET,
      }),
    );
  }
}

export async function isBucketReachable(): Promise<boolean> {
  try {
    await s3ControlClient.send(
      new HeadBucketCommand({
        Bucket: env.S3_BUCKET,
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export async function createMultipartUpload(input: {
  key: string;
  mime: string;
  cacheControl: string;
}): Promise<{ uploadId: string }> {
  const result = await s3ControlClient.send(
    new CreateMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      ContentType: input.mime,
      CacheControl: input.cacheControl,
    }),
  );

  if (!result.UploadId) {
    throw new Error('Failed to create multipart upload');
  }

  return { uploadId: result.UploadId };
}

export async function getMultipartPartUrls(input: {
  key: string;
  uploadId: string;
  partNumbers: number[];
}): Promise<Array<{ partNumber: number; url: string }>> {
  const urls = await Promise.all(
    input.partNumbers.map(async (partNumber) => {
      const command = new UploadPartCommand({
        Bucket: env.S3_BUCKET,
        Key: input.key,
        UploadId: input.uploadId,
        PartNumber: partNumber,
      });

      const url = await getSignedUrl(s3SigningClient, command, {
        expiresIn: env.PRESIGNED_URL_EXPIRES_SECONDS,
      });

      return {
        partNumber,
        url,
      };
    }),
  );

  return urls;
}

export async function completeMultipartUpload(input: {
  key: string;
  uploadId: string;
  parts: Array<{ partNumber: number; eTag: string }>;
}): Promise<void> {
  const sortedParts: CompletedPart[] = input.parts
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((part) => ({
      ETag: part.eTag.startsWith('"') ? part.eTag : `"${part.eTag}"`,
      PartNumber: part.partNumber,
    }));

  await s3ControlClient.send(
    new CompleteMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
      MultipartUpload: {
        Parts: sortedParts,
      },
    }),
  );
}

export async function abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void> {
  await s3ControlClient.send(
    new AbortMultipartUploadCommand({
      Bucket: env.S3_BUCKET,
      Key: input.key,
      UploadId: input.uploadId,
    }),
  );
}

export async function deleteObjectByKey(key: string): Promise<void> {
  await s3ControlClient.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );
}

export async function getPresignedDownloadUrl(input: {
  key: string;
  filename: string;
  cacheControl: string;
}): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: input.key,
    ResponseCacheControl: input.cacheControl,
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.filename)}`,
  });

  return getSignedUrl(s3SigningClient, command, {
    expiresIn: env.PRESIGNED_URL_EXPIRES_SECONDS,
  });
}

export async function readObjectStartForMime(key: string): Promise<string | null> {
  const response = await s3ControlClient.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      Range: 'bytes=0-8191',
    }),
  );

  const body = toReadable(response.Body);
  const chunks: Buffer[] = [];

  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const buffer = Buffer.concat(chunks);
  const fileType = await fileTypeFromBuffer(buffer);

  return fileType?.mime ?? null;
}

export async function getObjectStream(key: string): Promise<Readable> {
  const response = await s3ControlClient.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
    }),
  );

  return toReadable(response.Body);
}
