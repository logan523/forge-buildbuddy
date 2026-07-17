import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DrawerShell } from "./drawer-shell";

afterEach(() => cleanup());

test("Esc calls onClose", async () => {
  let closed = 0;
  render(
    <DrawerShell title="Parts" onClose={() => closed++}>
      <p>Body</p>
    </DrawerShell>
  );
  assert.ok(screen.getByText("Parts"));
  await userEvent.keyboard("{Escape}");
  assert.equal(closed, 1);
});

test("close button calls onClose", async () => {
  let closed = 0;
  render(
    <DrawerShell title="Parts" onClose={() => closed++}>
      <p>Body</p>
    </DrawerShell>
  );
  await userEvent.click(screen.getByRole("button", { name: /close/i }));
  assert.equal(closed, 1);
});
