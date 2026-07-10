/**
 * Web Speech wrapper for hands-free mode (E5 / eng V6).
 *
 * Chrome race: an utterance queued immediately after speechSynthesis.cancel()
 * is frequently dropped. speakLine cancels, waits ~80ms, queues, and retries
 * once if the utterance never starts. Speech is an ENHANCEMENT — every
 * failure degrades silently to large-type-only, and the failure is recorded
 * in diagnostics (never a silent mystery).
 */

import { diagLog } from "./diag";

export function isSpeechAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function"
  );
}

let pendingTimer: ReturnType<typeof setTimeout> | null = null;

export function stopSpeech(): void {
  if (!isSpeechAvailable()) return;
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingTimer = null;
  }
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* enhancement only */
  }
}

/**
 * Speak one line, replacing anything currently speaking (step advance cancels
 * and reads the new action — F4). Returns a cleanup that cancels.
 */
export function speakLine(text: string, opts?: { rate?: number }): () => void {
  if (!isSpeechAvailable() || !text.trim()) return () => {};

  stopSpeech();
  let cancelled = false;
  let retried = false;

  const queue = () => {
    if (cancelled) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = opts?.rate ?? 0.95;
      let started = false;
      utterance.onstart = () => {
        started = true;
      };
      utterance.onerror = () => {
        if (!started && !retried && !cancelled) {
          retried = true;
          diagLog("speech", "utterance dropped — retrying once");
          pendingTimer = setTimeout(queue, 120);
        }
      };
      window.speechSynthesis.speak(utterance);
      // Chrome drop-detection: if it never starts, retry once.
      pendingTimer = setTimeout(() => {
        if (!started && !retried && !cancelled) {
          retried = true;
          diagLog("speech", "utterance never started — retrying once");
          try {
            window.speechSynthesis.cancel();
          } catch {
            /* ignore */
          }
          pendingTimer = setTimeout(queue, 120);
        }
      }, 700);
    } catch (e) {
      diagLog("speech", `speak failed: ${String(e)}`);
    }
  };

  // The cancel→speak race: give the engine a beat after cancel().
  pendingTimer = setTimeout(queue, 80);

  return () => {
    cancelled = true;
    stopSpeech();
  };
}
