"use client";

/**
 * Slice A2 — the one-primary-action state machine. Replaces the old always-
 * three-buttons action block with a single, pure, prop-driven CTA: at any
 * moment there is exactly one thing BuildScreen wants the builder to do
 * next, and this bar says what it is. BuildScreen owns all the state this
 * reads (checklist counts via a DOM ref, guided-wire state via
 * GuidedActionContext, firmware-opened via a local flag) — this file just
 * resolves that snapshot into a label + tap behavior, so it's testable by
 * rendering it directly with plain props, no screen required.
 *
 * Precedence (first match wins):
 *   1. step already complete       → Next step / Share your build
 *   2. software step                → Open code package / Mark complete
 *   3. guided wire flow active      → mirror the current wire's own toggle
 *   4. checklist in progress        → "{n} of {total} done" (cannot skip)
 *   5. nothing else to check off    → Mark step complete
 */

import type { BuildStep } from "@/lib/types";
import { Button, type ButtonVariant } from "@/components/ui";

/** Mirrors the workbench's current wire — see GuidedActionContext in guided-action.ts. */
export interface PrimaryActionGuidedState {
  label: string;
  done: boolean;
  onToggle: () => void;
}

export interface PrimaryActionBarProps {
  step: BuildStep | undefined;
  /** Total actions in this step's checklist (0 when there is none, or it's a guided step). */
  actionsTotal: number;
  /** How many of those are checked. */
  actionsChecked: number;
  /** Non-null while the guided one-wire-at-a-time flow is showing a current wire. */
  guidedState: PrimaryActionGuidedState | null;
  isSoftwareStep: boolean;
  /** Has the firmware/code drawer been opened at least once for this step. */
  firmwareOpened: boolean;
  /** Is the CURRENT step marked complete. */
  completed: boolean;
  /** Is the current step the last one in the (mode-filtered) step list. */
  isLast: boolean;
  /** Are every one of the (mode-filtered) steps marked complete. */
  allComplete: boolean;
  onMarkComplete: () => void;
  onNext: () => void;
  onOpenFirmware: () => void;
  onShare: () => void;
  onScrollToFirstUnchecked: () => void;
}

interface ResolvedAction {
  label: string;
  variant: ButtonVariant;
  onClick: () => void;
}

function resolveAction(props: PrimaryActionBarProps): ResolvedAction {
  const {
    actionsTotal,
    actionsChecked,
    guidedState,
    isSoftwareStep,
    firmwareOpened,
    completed,
    isLast,
    allComplete,
    onMarkComplete,
    onNext,
    onOpenFirmware,
    onShare,
    onScrollToFirstUnchecked,
  } = props;

  // Once the step is done, the bar only ever moves forward — no undo, no
  // re-checking a completed checklist from here.
  if (completed) {
    return isLast || allComplete
      ? { label: "Share your build", variant: "primary", onClick: onShare }
      : { label: "Next step →", variant: "primary", onClick: onNext };
  }

  // Software steps gate on the firmware drawer before anything else — a
  // step can carry both a checklist AND be a software step (e.g. "upload
  // the blink sketch, confirm the LED blinks"), and opening the code is the
  // real prerequisite there, not ticking boxes.
  if (isSoftwareStep) {
    return firmwareOpened
      ? { label: "Mark complete", variant: "primary", onClick: onMarkComplete }
      : { label: "Open code package →", variant: "primary", onClick: onOpenFirmware };
  }

  // Guided wiring: mirror whatever GuidedSteps' own card is showing for the
  // current wire, so the same action is reachable from the thumb-zone bar.
  if (guidedState) {
    return {
      label: guidedState.label,
      variant: guidedState.done ? "secondary" : "primary",
      onClick: guidedState.onToggle,
    };
  }

  // A checklist exists and isn't finished — cannot skip it from here, only
  // jump to what's left. (100% checked auto-completes the step elsewhere —
  // ActionChecklist's onAutoComplete → BuildScreen's onToggleComplete — so
  // by the time actionsChecked reaches actionsTotal, `completed` above is
  // already true and this branch is unreachable for that case.)
  if (actionsTotal > 0 && actionsChecked < actionsTotal) {
    return {
      label: `${actionsChecked} of ${actionsTotal} done`,
      variant: "secondary",
      onClick: onScrollToFirstUnchecked,
    };
  }

  // Nothing to check off — the step itself is the action.
  return { label: "Mark step complete", variant: "primary", onClick: onMarkComplete };
}

export function PrimaryActionBar(props: PrimaryActionBarProps) {
  if (!props.step) return null;
  const action = resolveAction(props);
  return (
    <Button
      type="button"
      variant={action.variant}
      size="lg"
      onClick={action.onClick}
      className="w-full"
    >
      {action.label}
    </Button>
  );
}
