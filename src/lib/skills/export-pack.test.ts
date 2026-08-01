import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exportSkillPackFiles } from "./export-pack";
import { SKILLS } from "./catalog";

describe("export skill pack", () => {
  it("emits SKILL.md + manifest per skill + README", () => {
    const files = exportSkillPackFiles();
    assert.equal(files.filter((f) => f.path.endsWith("SKILL.md")).length, SKILLS.length);
    assert.equal(files.filter((f) => f.path.endsWith("manifest.yaml")).length, SKILLS.length);
    assert.ok(files.some((f) => f.path === "README.md"));
  });

  it("SKILL.md includes tools and no-ordinal-pin rule", () => {
    const md = exportSkillPackFiles().find((f) => f.path === "wire-one-net/SKILL.md")!;
    assert.match(md.content, /get_step_facts|build_wire_plan/);
    assert.match(md.content, /ordinal pin/i);
    assert.match(md.content, /wire-one-net/);
  });
});
