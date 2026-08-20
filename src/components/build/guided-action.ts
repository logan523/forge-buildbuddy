import { createContext } from "react";

/**
 * The current wire's "mark done" mirrored onto BuildScreen's primary action
 * bar (A2). Lived in guided-steps.tsx until Slice 1 of the build-copilot
 * cycle dissolved GuidedSteps into SolderWorkbench — the contract outlived
 * the component that minted it.
 */
export interface GuidedActionState {
  label: string;
  done: boolean;
  onToggle: () => void;
}

/**
 * BuildScreen provides the setter around the workbench; every other render
 * path (including tests that mount SolderWorkbench directly with no
 * provider) gets the default `null`, a safe no-op. See also the
 * `onGuidedState` prop — same data, for direct callers.
 */
export const GuidedActionContext = createContext<
  ((state: GuidedActionState | null) => void) | null
>(null);
