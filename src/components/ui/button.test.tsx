import "../../test-utils/dom";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { render, screen, cleanup } from "@testing-library/react";
import { Button, type ButtonVariant } from "./button";

afterEach(() => cleanup());

test("every variant renders its label", () => {
  const variants: ButtonVariant[] = ["primary", "secondary", "ghost", "danger"];
  render(
    <>
      {variants.map((v) => (
        <Button key={v} variant={v}>
          {v} button
        </Button>
      ))}
    </>
  );
  for (const v of variants) {
    assert.ok(screen.getByText(`${v} button`));
  }
});

test("loading disables the button and marks it aria-busy", () => {
  render(<Button loading>Save</Button>);
  const btn = screen.getByRole("button", { name: /save/i });
  assert.equal(btn.hasAttribute("disabled"), true);
  assert.equal(btn.getAttribute("aria-busy"), "true");
});
