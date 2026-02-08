'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { apiFetch, ApiError } from '../../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.push('/dashboard');
    } catch (requestError) {
      if (requestError instanceof ApiError) {
        setError(requestError.message);
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-16">
      <section className="w-full rounded-2xl border border-white/15 bg-brand-ink/70 p-6">
        <h1 className="font-display text-3xl font-bold text-brand-sand">Login</h1>
        <p className="mt-2 text-sm text-white/75">Sign in to fluxsolutions</p>

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

          <label className="block text-sm text-white/85">
            Password
            <input
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-white/20 bg-white/5 px-3 py-2 text-brand-sand"
            />
          </label>

          {error ? <p className="text-sm text-brand-rose">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-brand-mint px-4 py-2 font-semibold text-brand-ink hover:bg-brand-sand disabled:opacity-70"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm text-white/75">
          <Link href="/forgot-password" className="hover:text-brand-mint">
            Forgot password?
          </Link>
          <Link href="/register" className="hover:text-brand-mint">
            Create account
          </Link>
        </div>
      </section>
    </main>
  );
}
