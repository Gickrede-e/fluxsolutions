import Link from 'next/link';

export default function LandingPage() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <div className="absolute inset-0 -z-10 opacity-50 blur-3xl" aria-hidden>
        <div className="absolute left-8 top-14 h-40 w-40 rounded-full bg-brand-mint/40" />
        <div className="absolute right-12 top-24 h-48 w-48 rounded-full bg-brand-rose/30" />
      </div>

      <p className="font-mono text-xs uppercase tracking-[0.28em] text-brand-mint">fluxsolutions</p>
      <h1 className="mt-4 max-w-3xl font-display text-4xl font-bold leading-tight sm:text-6xl">
        File sharing engineered for speed, control, and secure edge delivery.
      </h1>
      <p className="mt-6 max-w-2xl text-base text-white/85 sm:text-lg">
        Upload up to 1GB per file, share with passwords/TTL/download limits, and ship downloads via CDN-aware
        presigned URLs.
      </p>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/dashboard"
          className="rounded-md bg-brand-mint px-6 py-3 font-semibold text-brand-ink transition hover:bg-brand-sand"
        >
          Upload
        </Link>
        <Link
          href="/register"
          className="rounded-md border border-white/35 px-6 py-3 font-semibold text-brand-sand transition hover:bg-white/10"
        >
          Create Account
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-brand-rose/50 px-6 py-3 font-semibold text-brand-sand transition hover:bg-brand-rose hover:text-brand-ink"
        >
          Login
        </Link>
      </div>
    </main>
  );
}
