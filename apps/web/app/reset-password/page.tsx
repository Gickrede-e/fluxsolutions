'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
          <section className="w-full rounded-2xl border border-white/15 bg-brand-ink/70 p-6">
            <h1 className="font-display text-3xl font-bold text-brand-sand">Reset Password</h1>
            <p className="mt-2 text-sm text-white/75">Loading reset form...</p>
          </section>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') ?? '', [searchParams]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!token) {
      setMessage('Missing reset token');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setMessage(response.message);
    } catch {
      setMessage('Unable to reset password. Token may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/15 bg-brand-ink/70 p-6">
        <h1 className="font-display text-3xl font-bold text-brand-sand">Reset Password</h1>
        <p className="mt-2 text-sm text-white/75">Use token from email and set a new password.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-white/85">
            New password
            <input
              type="password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-brand-sand"
            />
          </label>

          <label className="block text-sm text-white/85">
            Confirm password
            <input
              type="password"
              minLength={12}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-brand-sand"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink hover:bg-brand-sand disabled:opacity-70"
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>

        {message ? <p className="mt-4 text-sm text-brand-sand">{message}</p> : null}
      </section>
    </main>
  );
}
