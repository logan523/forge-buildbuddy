/** Action-focused step illustrations (IKEA/GitBuilding style) — not full product. */

export type StepMediaKind =
  | "oled_desolder"
  | "wire_bend_frame"
  | "cut_jumpers"
  | "battery_id_poles"
  | "touch_mount"
  | "i2c_wiring"
  | "usb_upload"
  | "solar_panel_mount"
  | "bamboo_base_drill"
  | "final_assembly"
  | "generic_checklist";

export interface StepMediaResult {
  kind: StepMediaKind;
  title: string;
  /** Primary instructional SVG */
  svg: string;
  /** Short caption under the figure */
  caption: string;
}
