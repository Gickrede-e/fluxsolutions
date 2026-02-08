'use client';

import { formatBytes } from '@fluxsolutions/shared';
import { API_BASE_URL } from '../lib/config';
import { apiFetch } from '../lib/api';
import type { FileDto, FolderDto } from '../lib/types';

interface FilesTableProps {
  files: FileDto[];
  folders: FolderDto[];
  onMutate: () => Promise<void> | void;
}

export function FilesTable({ files, folders, onMutate }: FilesTableProps) {
  async function renameFile(file: FileDto) {
    const nextName = window.prompt('New filename:', file.filename);
    if (!nextName || nextName === file.filename) {
      return;
    }

    await apiFetch(`/files/${file.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ filename: nextName }),
    });

    await onMutate();
  }

  async function moveFile(file: FileDto) {
    const currentFolderName = folders.find((folder) => folder.id === file.folderId)?.name ?? 'No folder';
    const folderName = window.prompt(
      `Move file to folder (current: ${currentFolderName}). Enter folder name or empty for root:`,
      currentFolderName,
    );

    if (folderName === null) {
      return;
    }

    const matchedFolder = folders.find((folder) => folder.name === folderName.trim());

    await apiFetch(`/files/${file.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ folderId: matchedFolder?.id ?? null }),
    });

    await onMutate();
  }

  async function deleteFile(file: FileDto) {
    if (!window.confirm(`Delete ${file.filename}?`)) {
      return;
    }

    await apiFetch(`/files/${file.id}`, {
      method: 'DELETE',
    });

    await onMutate();
  }

  async function shareFile(file: FileDto) {
    const password = window.prompt('Optional password for share (empty = public):', '');
    const oneTime = window.confirm('Should this be one-time (single download)?');
    const ttlHoursRaw = window.prompt('Optional expiry in hours (empty = no expiry):', '');
    const maxDownloadsRaw = window.prompt('Optional max downloads (empty = unlimited):', '');

    const expiresAt = ttlHoursRaw
      ? new Date(Date.now() + Number(ttlHoursRaw) * 60 * 60 * 1000).toISOString()
      : undefined;
    const maxDownloads = maxDownloadsRaw ? Number(maxDownloadsRaw) : undefined;

    const response = await apiFetch<{ share: { url: string } }>('/shares', {
      method: 'POST',
      body: JSON.stringify({
        fileId: file.id,
        password: password?.trim() ? password.trim() : undefined,
        oneTime,
        expiresAt,
        maxDownloads,
      }),
    });

    window.prompt('Share URL:', response.share.url);
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-white/15 bg-brand-ink/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm text-brand-sand">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/70">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Folder</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Scan</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/70">
                  No files yet.
                </td>
              </tr>
            ) : (
              files.map((file) => (
                <tr key={file.id} className="border-t border-white/10">
                  <td className="px-4 py-3 font-medium">{file.filename}</td>
                  <td className="px-4 py-3">{formatBytes(file.size)}</td>
                  <td className="px-4 py-3">{file.folder?.name ?? '—'}</td>
                  <td className="px-4 py-3">{new Date(file.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{file.scanStatus}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          void renameFile(file);
                        }}
                        className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void moveFile(file);
                        }}
                        className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        Move
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void shareFile(file);
                        }}
                        className="rounded bg-brand-mint/80 px-2 py-1 text-xs text-brand-ink hover:bg-brand-mint"
                      >
                        Share
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          window.open(`${API_BASE_URL}/files/${file.id}/download`, '_blank', 'noopener,noreferrer');
                        }}
                        className="rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteFile(file);
                        }}
                        className="rounded bg-brand-rose/80 px-2 py-1 text-xs text-brand-ink hover:bg-brand-rose"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
