'use client';

import { formatBytes } from '@fluxsolutions/shared';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TopNav } from '../../components/top-nav';
import { apiFetch, ApiError } from '../../lib/api';
import type { UserDto } from '../../lib/types';

const fetcher = <T,>(path: string) => apiFetch<T>(path);

interface AdminStats {
  totals: {
    users: number;
    bannedUsers: number;
    files: number;
    storageBytes: number;
  };
  recentUploads: Array<{
    id: string;
    filename: string;
    size: number;
    createdAt: string;
    owner: { id: string; email: string };
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    targetType: string;
    targetId: string | null;
    ip: string | null;
    createdAt: string;
  }>;
}

export default function AdminPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: me, error: meError } = useSWR<{ user: UserDto }>('/me', fetcher, {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (meError instanceof ApiError && meError.status === 401) {
      router.push('/login');
    }
  }, [meError, router]);

  const usersPath = useMemo(() => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '100',
    });

    if (search.trim()) {
      params.set('q', search.trim());
    }

    return `/admin/users?${params.toString()}`;
  }, [search]);

  const { data: statsData, mutate: mutateStats } = useSWR<AdminStats>(
    me?.user.role === 'ADMIN' ? '/admin/stats' : null,
    fetcher,
  );

  const { data: usersData, mutate: mutateUsers } = useSWR<{
    users: UserDto[];
    total: number;
  }>(me?.user.role === 'ADMIN' ? usersPath : null, fetcher);

  async function toggleBan(user: UserDto, banned: boolean) {
    await apiFetch(`/admin/users/${user.id}/ban`, {
      method: 'POST',
      body: JSON.stringify({ banned }),
    });

    await mutateUsers();
    await mutateStats();
  }

  if (!me) {
    return <main className="p-8 text-brand-sand">Loading...</main>;
  }

  if (me.user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen">
        <TopNav />
        <main className="mx-auto max-w-3xl px-5 py-8">
          <section className="rounded-2xl border border-brand-rose/50 bg-brand-ink/60 p-6">
            <h1 className="font-display text-3xl font-semibold">Admin access required</h1>
            <p className="mt-3 text-sm text-white/75">Your account does not have admin privileges.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
        <section className="grid gap-4 rounded-2xl border border-white/15 bg-brand-ink/60 p-5 sm:grid-cols-4">
          <StatCard label="Users" value={String(statsData?.totals.users ?? 0)} />
          <StatCard label="Banned" value={String(statsData?.totals.bannedUsers ?? 0)} />
          <StatCard label="Files" value={String(statsData?.totals.files ?? 0)} />
          <StatCard label="Storage" value={formatBytes(statsData?.totals.storageBytes ?? 0)} />
        </section>

        <section className="rounded-2xl border border-white/15 bg-brand-ink/60 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-2xl">Users</h2>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by email"
              className="rounded-md border border-white/20 bg-white/5 px-3 py-2 text-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/70">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Banned</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {(usersData?.users ?? []).map((user) => (
                  <tr key={user.id} className="border-t border-white/10">
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.role}</td>
                    <td className="px-3 py-2">{user.banned ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          void toggleBan(user, !user.banned);
                        }}
                        className="rounded bg-brand-mint px-2 py-1 text-xs font-semibold text-brand-ink hover:bg-brand-sand"
                      >
                        {user.banned ? 'Unban' : 'Ban'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/15 bg-brand-ink/60 p-5">
            <h2 className="font-display text-2xl">Recent uploads</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/85">
              {(statsData?.recentUploads ?? []).map((upload) => (
                <li key={upload.id} className="rounded border border-white/10 p-2">
                  <p className="font-semibold">{upload.filename}</p>
                  <p className="text-xs text-white/70">
                    {formatBytes(upload.size)} by {upload.owner.email} on {new Date(upload.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-white/15 bg-brand-ink/60 p-5">
            <h2 className="font-display text-2xl">Audit log</h2>
            <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-xs text-white/80">
              {(statsData?.auditLogs ?? []).map((audit) => (
                <li key={audit.id} className="rounded border border-white/10 p-2">
                  <p className="font-semibold">{audit.action}</p>
                  <p className="text-white/65">
                    {audit.targetType}:{audit.targetId ?? '—'} | {audit.ip ?? 'unknown ip'} |{' '}
                    {new Date(audit.createdAt).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-white/60">{label}</p>
      <p className="mt-2 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}
