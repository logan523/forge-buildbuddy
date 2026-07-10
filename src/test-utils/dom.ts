/**
 * jsdom bootstrap for component tests under node:test (tsx runner).
 * Import this FIRST in any *.test.tsx that renders React components:
 *
 *   import "../test-utils/dom";
 *   import { render, screen, cleanup } from "@testing-library/react";
 *
 * Scope: leaf DOM components only (no R3F/WebGL — the 3D stage is covered
 * by the browser characterization walk, not jsdom).
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
});

const win = dom.window;

function define(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  });
}

define("window", win);
define("document", win.document);
define("navigator", win.navigator);
define("localStorage", win.localStorage);
define("sessionStorage", win.sessionStorage);

for (const ctor of [
  "HTMLElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "SVGElement",
  "Element",
  "Node",
  "Event",
  "CustomEvent",
  "MouseEvent",
  "KeyboardEvent",
  "InputEvent",
  "FocusEvent",
  "PointerEvent",
  "DOMParser",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const) {
  const value = (win as unknown as Record<string, unknown>)[ctor];
  if (value !== undefined) define(ctor, typeof value === "function" && ctor === "getComputedStyle" ? (value as (e: globalThis.Element) => unknown).bind(win) : value);
}

if (typeof win.requestAnimationFrame !== "function") {
  define("requestAnimationFrame", (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0));
  define("cancelAnimationFrame", (id: number) => clearTimeout(id));
}

if (typeof win.matchMedia !== "function") {
  const stub = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
  define("matchMedia", stub);
  Object.defineProperty(win, "matchMedia", { value: stub, configurable: true, writable: true });
}

if (typeof (win as unknown as { ResizeObserver?: unknown }).ResizeObserver !== "function") {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  define("ResizeObserver", ResizeObserverStub);
  Object.defineProperty(win, "ResizeObserver", { value: ResizeObserverStub, configurable: true, writable: true });
}

// React 19 act() support outside a test framework's auto-config.
define("IS_REACT_ACT_ENVIRONMENT", true);
