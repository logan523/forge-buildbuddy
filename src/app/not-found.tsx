import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">404</p>
        <h1 className="text-xl font-bold font-serif text-text mb-2">Page not found</h1>
        <p className="text-sm text-text-secondary mb-4">
          This page doesn&apos;t exist. Check the link, or start a new build from home.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold no-underline"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
