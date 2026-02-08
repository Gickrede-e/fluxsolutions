'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { apiFetch } from '../../lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await apiFetch<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(response.message);
    } catch {
      setMessage('Unable to process request right now');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/15 bg-brand-ink/70 p-6">
        <h1 className="font-display text-3xl font-bold text-brand-sand">Forgot Password</h1>
        <p className="mt-2 text-sm text-white/75">Enter your email to receive a reset token/link.</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block text-sm text-white/85">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-brand-sand"
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink hover:bg-brand-sand disabled:opacity-70"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>

        {message ? <p className="mt-4 text-sm text-brand-sand">{message}</p> : null}

        <p className="mt-4 text-sm text-white/75">
          <Link href="/login" className="text-brand-mint hover:text-brand-sand">
            Back to login
          </Link>
        </p>
      </section>
    </main>
  );
}
