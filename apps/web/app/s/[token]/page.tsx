'use client';

import { formatBytes } from '@fluxsolutions/shared';
import { useParams } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE_URL } from '../../../lib/config';
import { apiFetch } from '../../../lib/api';
import type { ShareMetadataDto } from '../../../lib/types';

const fetcher = <T,>(path: string) => apiFetch<T>(path);

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? '';
  const [password, setPassword] = useState('');
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const metadataPath = useMemo(() => (token ? `/s/${token}` : null), [token]);
  const { data, mutate, isLoading } = useSWR<ShareMetadataDto>(metadataPath, fetcher);

  async function verifyPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    try {
      const response = await apiFetch<{ verificationToken: string | null }>(`/s/${token}/verify`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });

      setVerificationToken(response.verificationToken);
      setMessage('Password verified. Download is enabled.');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Invalid password';
      setMessage(text);
    }
  }

  function downloadFile() {
    const url = new URL(`${API_BASE_URL}/s/${token}/download`);
    if (verificationToken) {
      url.searchParams.set('verificationToken', verificationToken);
    }

    window.location.href = url.toString();
    setTimeout(() => {
      void mutate();
    }, 1500);
  }

  if (isLoading) {
    return <main className="p-10 text-brand-sand">Loading shared file...</main>;
  }

  if (!data) {
    return <main className="p-10 text-brand-sand">Share not found.</main>;
  }

  const unavailable = !data.availability.available;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/15 bg-brand-ink/70 p-6">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-brand-mint">fluxsolutions share</p>
        <h1 className="mt-2 font-display text-3xl font-bold text-brand-sand">{data.file.filename}</h1>
        <p className="mt-2 text-sm text-white/75">
          {formatBytes(data.file.size)} • {data.file.mime}
        </p>

        <div className="mt-5 rounded-lg border border-white/15 bg-white/5 p-4 text-sm text-white/85">
          <p>Status: {unavailable ? `Unavailable (${data.availability.reason})` : 'Available'}</p>
          <p>Downloads: {data.downloadsCount}</p>
          <p>Max downloads: {data.maxDownloads ?? 'Unlimited'}</p>
          <p>One-time: {data.oneTime ? 'Yes' : 'No'}</p>
          <p>Expires at: {data.expiresAt ? new Date(data.expiresAt).toLocaleString() : 'Never'}</p>
          <p>Scan status: {data.file.scanStatus}</p>
        </div>

        {data.passwordRequired && !verificationToken ? (
          <form onSubmit={verifyPassword} className="mt-5 space-y-3">
            <label className="block text-sm text-white/85">
              Share password
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2"
              />
            </label>

            <button
              type="submit"
              className="rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink hover:bg-brand-sand"
            >
              Verify password
            </button>
          </form>
        ) : null}

        {message ? <p className="mt-4 text-sm text-brand-sand">{message}</p> : null}

        <button
          type="button"
          disabled={unavailable || (data.passwordRequired && !verificationToken)}
          onClick={downloadFile}
          className="mt-6 rounded-md bg-brand-mint px-5 py-2 font-semibold text-brand-ink hover:bg-brand-sand disabled:cursor-not-allowed disabled:opacity-60"
        >
          Download
        </button>
      </section>
    </main>
  );
}
