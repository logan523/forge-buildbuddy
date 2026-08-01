import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CLASSROOM_LABS, classroomLabById } from "./catalog";

describe("classroom catalog", () => {
  it("has sat-line lab with offline tasks", () => {
    assert.ok(CLASSROOM_LABS.length >= 1);
    const lab = classroomLabById("lab-sat-line");
    assert.ok(lab);
    assert.deepEqual(lab!.taskIds, ["T01", "T02", "T03", "T04", "T05", "T06"]);
    assert.ok(lab!.skillIds.includes("i2c-ssd1306"));
  });
});
