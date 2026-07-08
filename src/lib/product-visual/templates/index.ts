import type { BuildPlan } from "@/lib/types";
import type { FormSpec } from "../formspec/types";
import type { AssemblyStage, ProductScene } from "../types";
import { renderSatClock } from "./sat-clock";
import { renderWeatherStick } from "./weather-stick";
import { renderRobotChassis } from "./robot-chassis";
import { renderSensorPod } from "./sensor-pod";
import { renderBoxedGadget } from "./boxed-gadget";
import { renderBreadboard } from "./breadboard";

export function renderTemplate(
  plan: BuildPlan,
  spec: FormSpec,
  stage: AssemblyStage,
  scene: ProductScene,
  opts?: { showTech?: boolean }
): string {
  switch (spec.templateId) {
    case "sat_clock":
      return renderSatClock(plan, spec, stage, opts);
    case "weather_stick":
      return renderWeatherStick(plan, spec, stage);
    case "robot_chassis":
      return renderRobotChassis(plan, spec, stage);
    case "sensor_pod":
      return renderSensorPod(plan, spec, stage);
    case "boxed_gadget":
      return renderBoxedGadget(plan, spec, stage);
    case "breadboard":
    default:
      return renderBreadboard(plan, spec, stage, scene);
  }
}
