/** Wordmark Customizer types (MVP: NOTCH_CUT, SEAM_CUT, LIGATURE_BRIDGE). */

export interface GlyphRun {
  index: number;
  char: string;
  path_d: string;
  bbox: { x: number; y: number; w: number; h: number };
  advance: number;
}

export interface WordmarkBase {
  path_d: string;
  viewBox: string;
  width: number;
  height: number;
  glyphs: GlyphRun[];
}

export type DeviceSpec =
  | { kind: "notch_cut"; target: "single"; letter: string; side: "inner" | "outer" | "top" | "bottom"; depth: number; width: number }
  | { kind: "seam_cut"; target: "single"; letter: string; angle_deg: number; thickness: number; offset: number }
  | { kind: "ligature_bridge"; target: "pair"; from: string; to: string; thickness: number; y_pos: "baseline" | "xheight" | "cap" };

export interface WordmarkCustomizationPlan {
  target_letters: string[];
  devices: DeviceSpec[];
  boldness: { compression: number; weight_bias: number };
  optical: { overshoot: number };
  reject_if: string[];
}

export interface WordmarkCustomizeInput {
  base: WordmarkBase;
  plan: WordmarkCustomizationPlan;
  seed: string;
}

export interface DeviceManifestItem {
  device: string;
  target: string;
  applied: boolean;
}

export interface WordmarkMetrics {
  device_visibility: number;
  silhouette_delta: number;
  default_font_risk: number;
  legibility: number;
}

export interface WordmarkCustomizeOutput {
  wordmark_path_d: string;
  wordmark_svg: string;
  manifest: DeviceManifestItem[];
  metrics: WordmarkMetrics;
}
