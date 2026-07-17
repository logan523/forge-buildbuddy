"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <h1 className="text-xl font-bold font-serif text-text mb-2">Something went wrong</h1>
        <p className="text-sm text-text-secondary mb-4">
          An unexpected error interrupted this page. Your builds are still saved in this
          browser — try again, or head back home.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="px-5 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold cursor-pointer"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-5 py-2.5 rounded-xl border border-border-subtle text-text text-sm font-semibold no-underline"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
