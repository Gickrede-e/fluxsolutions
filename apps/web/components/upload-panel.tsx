'use client';

import { useRef, useState } from 'react';
import { formatBytes } from '@fluxsolutions/shared';
import { uploadFileResumable } from '../lib/multipart-upload';
import { MAX_FILE_SIZE_BYTES } from '../lib/config';
import type { FolderDto } from '../lib/types';

interface UploadPanelProps {
  folders: FolderDto[];
  onUploaded: () => Promise<void> | void;
}

export function UploadPanel({ folders, onUploaded }: UploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string>('');

  async function startUpload(file: File) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setMessage(`File too large. Max allowed size is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`);
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setMessage(null);

    try {
      await uploadFileResumable({
        file,
        folderId: folderId || null,
        onProgress: (value) => setProgress(value),
      });
      setMessage(`Uploaded ${file.name}`);
      await onUploaded();
    } catch (error) {
      const uploadMessage = error instanceof Error ? error.message : 'Upload failed';
      setMessage(uploadMessage);
    } finally {
      setIsUploading(false);
      setProgress(0);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  }

  return (
    <section className="rounded-2xl border border-brand-mint/35 bg-brand-ink/60 p-4 shadow-glow">
      <div
        className={`rounded-xl border-2 border-dashed p-8 text-center transition ${
          isDragging ? 'border-brand-mint bg-brand-mint/15' : 'border-white/20 bg-white/5'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const [file] = Array.from(event.dataTransfer.files);
          if (file) {
            void startUpload(file);
          }
        }}
      >
        <p className="font-display text-lg text-brand-sand">Drop file to upload</p>
        <p className="mt-2 text-sm text-white/80">Resumable S3 multipart upload to MinIO</p>
        <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <select
            value={folderId}
            onChange={(event) => setFolderId(event.target.value)}
            className="w-full rounded-md border border-white/20 bg-brand-ink px-3 py-2 text-sm text-brand-sand sm:w-64"
          >
            <option value="">No folder</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={isUploading}
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink transition hover:bg-brand-sand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUploading ? 'Uploading...' : 'Choose File'}
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const [file] = Array.from(event.target.files ?? []);
            if (file) {
              void startUpload(file);
            }
          }}
        />

        {isUploading ? (
          <div className="mx-auto mt-5 max-w-md">
            <div className="h-2 rounded-full bg-white/20">
              <div
                className="h-2 rounded-full bg-brand-mint transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-brand-sand">{progress}%</p>
          </div>
        ) : null}

        {message ? <p className="mt-4 text-sm text-brand-sand">{message}</p> : null}
      </div>
    </section>
  );
}
