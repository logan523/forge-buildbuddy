import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { presentErc } from "./present";
import type { ElectricalComponent, ErcReport } from "./types";

const comps: ElectricalComponent[] = [
  {
    ref: "U1",
    partId: "oled",
    name: "OLED Display",
    pinoutGrade: "verified",
    pins: [],
  },
  {
    ref: "U2",
    partId: "mcu",
    name: "ESP32-C3 Microcontroller",
    pinoutGrade: "verified",
    pins: [],
  },
];

describe("presentErc dual audience", () => {
  it("keeps expert title and adds plain beginner copy", () => {
    const erc: ErcReport = {
      errors: [
        {
          id: "v1",
          severity: "error",
          rule: "VOLTAGE_DOMAIN",
          title: "5V rail on U1.VCC (max 3.6V)",
          detail: "Net 5V looks like a 5V domain but U1.VCC is limited to 3.6V.",
          mitigation: "Move to 3.3V.",
          refs: ["U1"],
          nets: ["5V"],
        },
      ],
      warnings: [],
      infos: [],
      clean: false,
      canExportPcb: false,
      canPublishKit: false,
      summary: "ERC failed: 1 error(s).",
    };
    const v = presentErc(erc, comps);
    assert.equal(v.errors[0].plainTitle, "Wrong voltage on a part");
    assert.match(v.errors[0].plainDetail, /OLED|3\.3V|higher-voltage/i);
    assert.equal(v.errors[0].techTitle, "5V rail on U1.VCC (max 3.6V)");
    assert.equal(v.errors[0].rule, "VOLTAGE_DOMAIN");
    assert.ok(v.errors[0].refLabels.some((l) => l.includes("OLED")));
    assert.match(v.summaryPlain, /problem/i);
  });

  it("clean summary is beginner-friendly", () => {
    const erc: ErcReport = {
      errors: [],
      warnings: [],
      infos: [],
      clean: true,
      canExportPcb: true,
      canPublishKit: true,
      summary: "ERC clean — no errors or warnings.",
    };
    const v = presentErc(erc, comps);
    assert.match(v.summaryPlain, /good|ready/i);
  });
});
