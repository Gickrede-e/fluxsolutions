'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TopNav } from '../../components/top-nav';
import { apiFetch, ApiError } from '../../lib/api';
import type { UserDto } from '../../lib/types';

const fetcher = <T,>(path: string) => apiFetch<T>(path);

export default function SettingsPage() {
  const router = useRouter();
  const { data: me, error } = useSWR<{ user: UserDto }>('/me', fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.push('/login');
    }
  }, [error, router]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiFetch<{ message: string }>('/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage(`${response.message} Redirecting to login...`);
      await apiFetch('/auth/logout', { method: 'POST' });
      setTimeout(() => router.push('/login'), 1200);
    } catch (requestError) {
      const nextMessage = requestError instanceof Error ? requestError.message : 'Unable to update password';
      setMessage(nextMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-xl px-5 py-8">
        <section className="rounded-2xl border border-white/15 bg-brand-ink/60 p-6">
          <h1 className="font-display text-3xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-white/75">Password management for {me?.user.email ?? 'your account'}.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block text-sm text-white/85">
              Current password
              <input
                type="password"
                required
                minLength={12}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2"
              />
            </label>

            <label className="block text-sm text-white/85">
              New password
              <input
                type="password"
                required
                minLength={12}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink hover:bg-brand-sand disabled:opacity-70"
            >
              {loading ? 'Updating...' : 'Change password'}
            </button>
          </form>

          {message ? <p className="mt-4 text-sm text-brand-sand">{message}</p> : null}
        </section>
      </main>
    </div>
  );
}
