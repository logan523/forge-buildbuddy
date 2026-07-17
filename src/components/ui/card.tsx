"use client";

import { forwardRef, type HTMLAttributes } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
  elevated?: boolean;
}

// Cards tier is rounded-lg going forward (radius-lg per globals.css radii tiers).
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padded = true, elevated = false, className = "", children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={`rounded-lg border border-border-subtle bg-surface ${elevated ? "shadow-card" : ""} ${padded ? "p-4" : ""} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
});
