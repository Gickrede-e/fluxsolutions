import net from 'node:net';
import type { Readable } from 'node:stream';

export interface ClamavScanResult {
  clean: boolean;
  raw: string;
  signature?: string;
}

export async function scanReadableWithClamav(input: {
  stream: Readable;
  host: string;
  port: number;
  timeoutMs?: number;
}): Promise<ClamavScanResult> {
  const timeoutMs = input.timeoutMs ?? 90_000;

  return new Promise<ClamavScanResult>((resolve, reject) => {
    const socket = net.createConnection({ host: input.host, port: input.port });
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error('ClamAV scan timed out'));
    }, timeoutMs);

    socket.on('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0'));

      input.stream.on('data', (chunk) => {
        const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length, 0);
        socket.write(length);
        socket.write(data);
      });

      input.stream.on('end', () => {
        socket.write(Buffer.alloc(4));
      });

      input.stream.on('error', (error) => {
        socket.destroy(error);
      });
    });

    socket.on('data', (chunk) => {
      response += chunk.toString('utf8');
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      const normalized = response.trim();

      if (normalized.includes('FOUND')) {
        const signature = normalized.split('FOUND')[0]?.split(':').pop()?.trim();
        resolve({
          clean: false,
          raw: normalized,
          signature: signature || undefined,
        });
        return;
      }

      if (normalized.includes('OK')) {
        resolve({ clean: true, raw: normalized });
        return;
      }

      reject(new Error(`Unexpected ClamAV response: ${normalized || '<empty>'}`));
    });
  });
}
