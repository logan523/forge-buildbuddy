import "../../test-utils/dom";
import { test, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BuildPlan, BuildStep } from "@/lib/types";
import { HandsFreeMode } from "./hands-free";
import { speakLine, isSpeechAvailable } from "@/lib/speech";

/* Stubbed speech engine — records utterances, lets tests fire start events. */
class UtteranceStub {
  text: string;
  rate = 1;
  onstart: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}
const spoken: UtteranceStub[] = [];
const synth = {
  cancel: () => {},
  speak: (u: UtteranceStub) => {
    spoken.push(u);
    u.onstart?.();
  },
};

beforeEach(() => {
  spoken.length = 0;
  Object.defineProperty(globalThis, "speechSynthesis", {
    value: synth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.window, "speechSynthesis", {
    value: synth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
    value: UtteranceStub,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis.window, "SpeechSynthesisUtterance", {
    value: UtteranceStub,
    configurable: true,
    writable: true,
  });
  localStorage.clear();
});

afterEach(() => cleanup());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("speakLine queues after the cancel beat (V6 race guard)", async () => {
  assert.equal(isSpeechAvailable(), true);
  const cancel = speakLine("Solder the blue wire");
  assert.equal(spoken.length, 0, "not queued synchronously after cancel()");
  await wait(140);
  assert.equal(spoken.length, 1);
  assert.ok(spoken[0].text.includes("blue wire"));
  cancel();
});

const step = (n: number, title: string, actions: { n: number; text: string }[]): BuildStep =>
  ({ stepNumber: n, title, description: title, actions }) as unknown as BuildStep;

const plan = { id: "hf-plan" } as unknown as BuildPlan;

test("hands-free: Done advances actions, completes the step, moves on", async () => {
  const steps = [
    step(1, "Wire it", [
      { n: 1, text: "Cut the wire" },
      { n: 2, text: "Solder the wire" },
    ]),
    step(2, "Test it", [{ n: 1, text: "Power on" }]),
  ];
  let completedCalls: number[] = [];
  let goneTo: number[] = [];
  render(
    <HandsFreeMode
      plan={plan}
      steps={steps}
      stepIndex={0}
      completed={new Set()}
      onGoStep={(i) => goneTo.push(i)}
      onToggleComplete={(n) => completedCalls.push(n)}
      onClose={() => {}}
    />
  );

  assert.ok(screen.getByText("Cut the wire"), "first action shows huge");
  await userEvent.click(screen.getByRole("button", { name: /done — next/i }));
  assert.ok(screen.getByText("Solder the wire"), "advances to second action");
  assert.deepEqual(completedCalls, [], "step not complete mid-way");

  await userEvent.click(screen.getByRole("button", { name: /done — next/i }));
  assert.deepEqual(completedCalls, [1], "last action completes the step");
  assert.deepEqual(goneTo, [1], "and moves to the next step");
});

test("hands-free: Back re-opens the previous action without un-completing the step", async () => {
  const steps = [
    step(1, "Wire it", [
      { n: 1, text: "Cut the wire" },
      { n: 2, text: "Solder the wire" },
    ]),
  ];
  render(
    <HandsFreeMode
      plan={plan}
      steps={steps}
      stepIndex={0}
      completed={new Set()}
      onGoStep={() => {}}
      onToggleComplete={() => {}}
      onClose={() => {}}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: /done — next/i }));
  assert.ok(screen.getByText("Solder the wire"));
  await userEvent.click(screen.getByRole("button", { name: /back/i }));
  assert.ok(screen.getByText("Cut the wire"), "back returns to the prior action");
});
