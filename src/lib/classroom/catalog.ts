/**
 * Classroom labs — frozen kits + task gates for a course section
 * (docs/FORGE-AGENTIC-EXPANSION.md markets: engineering students / labs).
 */

export interface ClassroomLab {
  id: string;
  title: string;
  /** Repo-relative path to plan JSON. */
  planPath: string;
  /** Task explorer ids that must pass offline. */
  taskIds: string[];
  /** Skills students should install. */
  skillIds: string[];
  /** One-paragraph lab brief. */
  brief: string;
  estimatedMinutes: number;
}

export const CLASSROOM_LABS: ClassroomLab[] = [
  {
    id: "lab-sat-line",
    title: "Sat Line — solar smart clock",
    planPath: "src/data/sat-line.json",
    taskIds: ["T01", "T02", "T03", "T04", "T05", "T06"],
    skillIds: [
      "part-identify",
      "wire-one-net",
      "i2c-ssd1306",
      "esp32c3-flash",
      "step-isolate",
      "isolation-walk",
    ],
    brief:
      "Build the demo Sat Line kit: identify parts, wire I2C OLED with authority colors, pass harness+render audits, prepare flash, and know expected I2C addresses for live verify.",
    estimatedMinutes: 180,
  },
];

export function classroomLabById(id: string): ClassroomLab | undefined {
  return CLASSROOM_LABS.find((l) => l.id === id);
}
