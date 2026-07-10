import "./dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useState } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

afterEach(() => cleanup());

function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      count {n}
    </button>
  );
}

test("component harness: renders and handles interaction in jsdom", async () => {
  render(<Counter />);
  const btn = screen.getByRole("button", { name: /count 0/ });
  await userEvent.click(btn);
  assert.ok(screen.getByRole("button", { name: /count 1/ }));
});

test("component harness: checkbox semantics primitive works", async () => {
  render(<input type="checkbox" aria-label="action 1" />);
  const box = screen.getByRole("checkbox", { name: "action 1" }) as HTMLInputElement;
  assert.equal(box.checked, false);
  await userEvent.click(box);
  assert.equal(box.checked, true);
});
