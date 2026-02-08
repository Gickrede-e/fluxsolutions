'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TopNav } from '../../components/top-nav';
import { UploadPanel } from '../../components/upload-panel';
import { FilesTable } from '../../components/files-table';
import { apiFetch, ApiError } from '../../lib/api';
import type { FileDto, FolderDto, UserDto } from '../../lib/types';

const fetcher = <T,>(path: string) => apiFetch<T>(path);

export default function DashboardPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [folderName, setFolderName] = useState('');
  const [folderError, setFolderError] = useState<string | null>(null);

  const {
    data: me,
    error: meError,
    isLoading: meLoading,
  } = useSWR<{ user: UserDto }>('/me', fetcher, { revalidateOnFocus: false });

  useEffect(() => {
    if (meError instanceof ApiError && meError.status === 401) {
      router.push('/login');
    }
  }, [meError, router]);

  const filesPath = useMemo(() => {
    const params = new URLSearchParams({
      page: '1',
      pageSize: '50',
    });

    if (search.trim()) {
      params.set('q', search.trim());
    }

    return `/files?${params.toString()}`;
  }, [search]);

  const { data: filesData, mutate: mutateFiles, isLoading: filesLoading } = useSWR<{
    items: FileDto[];
    total: number;
    page: number;
    pageSize: number;
  }>(me ? filesPath : null, fetcher);

  const { data: foldersData, mutate: mutateFolders } = useSWR<{ folders: FolderDto[] }>(
    me ? '/folders' : null,
    fetcher,
  );

  async function createFolder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim()) {
      return;
    }

    setFolderError(null);
    try {
      await apiFetch('/folders', {
        method: 'POST',
        body: JSON.stringify({ name: folderName.trim() }),
      });
      setFolderName('');
      await mutateFolders();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create folder';
      setFolderError(message);
    }
  }

  if (meLoading) {
    return <main className="p-10 text-brand-sand">Loading dashboard...</main>;
  }

  if (!me) {
    return <main className="p-10 text-brand-sand">Checking session...</main>;
  }

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-6">
        <section className="rounded-2xl border border-white/15 bg-brand-ink/60 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-brand-mint">Dashboard</p>
              <h1 className="mt-1 font-display text-3xl font-semibold">Your files</h1>
              <p className="mt-2 text-sm text-white/80">Signed in as {me.user.email}</p>
            </div>
            {me.user.role === 'ADMIN' ? (
              <Link
                href="/admin"
                className="rounded-md border border-brand-mint/50 px-4 py-2 text-sm font-semibold hover:bg-brand-mint hover:text-brand-ink"
              >
                Open Admin
              </Link>
            ) : null}
          </div>
        </section>

        <UploadPanel
          folders={foldersData?.folders ?? []}
          onUploaded={async () => {
            await mutateFiles();
          }}
        />

        <section className="grid gap-4 rounded-2xl border border-white/15 bg-brand-ink/60 p-4 md:grid-cols-2">
          <form onSubmit={createFolder} className="space-y-2">
            <label className="block text-sm text-white/80">Create folder</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="Example: contracts"
                className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2"
              />
              <button
                type="submit"
                className="rounded-md bg-brand-mint px-4 py-2 text-sm font-semibold text-brand-ink hover:bg-brand-sand"
              >
                Create
              </button>
            </div>
            {folderError ? <p className="text-xs text-brand-rose">{folderError}</p> : null}
          </form>

          <div className="space-y-2">
            <label className="block text-sm text-white/80">Search by filename</label>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="invoice, backup, report..."
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-2"
            />
            <p className="text-xs text-white/60">
              {filesLoading ? 'Loading files...' : `Found ${filesData?.total ?? 0} file(s)`}
            </p>
          </div>
        </section>

        <FilesTable
          files={filesData?.items ?? []}
          folders={foldersData?.folders ?? []}
          onMutate={async () => {
            await mutateFiles();
            await mutateFolders();
          }}
        />
      </main>
    </div>
  );
}
