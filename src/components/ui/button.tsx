"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

// Matches the accent solid/outline/text/danger buttons already shipping
// across build-screen.tsx / build-ui.tsx / build-drawers.tsx.
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:bg-accent-soft",
  secondary: "bg-surface text-text border border-border hover:bg-surface-overlay",
  ghost: "bg-transparent text-text hover:bg-surface-overlay",
  danger: "bg-danger text-white hover:bg-danger/90",
};

// sm = chip-height (matches the existing 28px chip buttons); md/lg clear the
// 40px / 44px workbench tap-target floor.
const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "text-xs px-2.5 py-1.5 min-h-[28px] gap-1.5",
  md: "text-sm px-4 py-2 min-h-10 gap-2",
  lg: "text-sm px-5 py-3 min-h-11 gap-2",
};

const SPINNER_SIZE: Record<ButtonSize, string> = {
  sm: "w-3 h-3",
  md: "w-3.5 h-3.5",
  lg: "w-4 h-4",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, disabled, className = "", children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`btn-spring inline-flex items-center justify-center rounded-md font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg className={`animate-spin ${SPINNER_SIZE[size]}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {children}
    </button>
  );
});
