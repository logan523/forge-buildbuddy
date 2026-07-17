import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComputerReady } from "./computer-ready";
import { boardSetupInfo } from "@/lib/firmware";

afterEach(() => {
  cleanup();
  try {
    delete (navigator as unknown as { clipboard?: unknown }).clipboard;
  } catch {
    /* ignore */
  }
});

/** Records every copy, like the real clipboard but observable in a test. */
function mockClipboard() {
  const calls: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        calls.push(text);
      },
    },
    configurable: true,
  });
  return calls;
}

test("collapsed by default: shows only the prominent trigger, no step content", () => {
  const setupInfo = boardSetupInfo("esp32c3");
  render(<ComputerReady family="esp32c3" setupInfo={setupInfo} libraries={[]} />);
  assert.ok(screen.getByRole("button", { name: /first time\? get your computer ready/i }));
  assert.equal(screen.queryByText(/download arduino ide/i), null);
});

test("expanding reveals the IDE step with a link to the real Arduino download page, labeled for the family", async () => {
  const setupInfo = boardSetupInfo("esp32c3");
  render(<ComputerReady family="esp32c3" setupInfo={setupInfo} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  assert.ok(screen.getByText(/get your computer ready for esp32-c3/i));
  const ideLink = screen.getByRole("link", { name: /download arduino ide/i });
  assert.equal(ideLink.getAttribute("href"), "https://www.arduino.cc/en/software");
  assert.equal(ideLink.getAttribute("target"), "_blank");
  assert.equal(ideLink.getAttribute("rel"), "noopener noreferrer");
});

test("board-manager copy button copies the exact URL and shows Copied feedback", async () => {
  const calls = mockClipboard();
  const setupInfo = boardSetupInfo("esp32c3")!;
  render(<ComputerReady family="esp32c3" setupInfo={setupInfo} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  assert.ok(screen.getByText(setupInfo.boardManagerUrl!));
  await userEvent.click(screen.getByRole("button", { name: /copy board manager url/i }));

  assert.deepEqual(calls, [setupInfo.boardManagerUrl]);
  assert.ok(screen.getByText(/copied/i));
});

test("library chips: Wire is filtered out (built-in), real libraries are tap-to-copy", async () => {
  const calls = mockClipboard();
  const setupInfo = boardSetupInfo("esp32c3");
  render(<ComputerReady family="esp32c3" setupInfo={setupInfo} libraries={["Wire", "Adafruit SSD1306"]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  assert.equal(screen.queryByRole("button", { name: /copy library name wire/i }), null);
  const chip = screen.getByRole("button", { name: /copy library name adafruit ssd1306/i });
  await userEvent.click(chip);
  assert.deepEqual(calls, ["Adafruit SSD1306"]);
});

test("nano (no board-manager URL): shows the built-in note instead of a copy button", async () => {
  const setupInfo = boardSetupInfo("nano")!;
  assert.equal(setupInfo.boardManagerUrl, null, "sanity check on the fixture this test relies on");
  render(<ComputerReady family="nano" setupInfo={setupInfo} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  assert.ok(screen.getByText(/built into the arduino ide already/i));
  assert.equal(screen.queryByRole("button", { name: /copy board manager url/i }), null);
});

test("unknown board (family/setupInfo null): only the IDE step and driver notes show — no board-support, board-package, or library steps", async () => {
  render(<ComputerReady family={null} setupInfo={null} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  // Present: IDE (always) + driver notes (generic fallback).
  assert.ok(screen.getByRole("link", { name: /download arduino ide/i }));
  assert.ok(screen.getByText(/ch340 driver/i));
  assert.ok(screen.getByText(/cp210x driver/i));

  // Absent: everything that needs a resolved family.
  assert.equal(screen.queryByText(/boards manager/i), null);
  assert.equal(screen.queryByText(/install the board package/i), null);
  assert.equal(screen.queryByRole("button", { name: /copy board manager url/i }), null);

  // The header falls back to generic phrasing (no "for null").
  assert.ok(screen.getByText(/^get your computer ready$/i));
});

test("plug-in step names the exact board-select menu entry when known", async () => {
  const setupInfo = boardSetupInfo("pico");
  render(<ComputerReady family="pico" setupInfo={setupInfo} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));
  assert.ok(screen.getByText(/raspberry pi pico/i, { selector: "strong" }));
});

test("checkbox toggles are session-local: checking a step doesn't throw and reflects in the checkbox state", async () => {
  const setupInfo = boardSetupInfo("esp32");
  render(<ComputerReady family="esp32" setupInfo={setupInfo} libraries={[]} />);
  await userEvent.click(screen.getByRole("button", { name: /first time\? get your computer ready/i }));

  const first = screen.getByRole("checkbox", { name: /step 1 done/i }) as HTMLInputElement;
  assert.equal(first.checked, false);
  await userEvent.click(first);
  assert.equal(first.checked, true);
});
