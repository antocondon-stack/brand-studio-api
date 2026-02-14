/**
 * Device appliers: take glyph run(s) and return modified path_d (NOTCH_CUT, SEAM_CUT, LIGATURE_BRIDGE).
 */

import type { GlyphRun } from "./types";
import { subtract, union } from "./geometry";
import { rectPath, wedgePath, diagonalBandPath, roundedRectPath } from "./shapes";

/** Apply notch cut to a single glyph (subtract wedge/rect from bbox zone). */
export function applyNotchCut(
  glyph: GlyphRun,
  params: { side: "inner" | "outer" | "top" | "bottom"; depth: number; width: number },
): string {
  const { bbox } = glyph;
  const { side, depth, width } = params;
  const h = Math.max(bbox.h * depth, 0.5);
  const w = Math.max(bbox.w * width, 0.5);
  let x: number, y: number;
  if (side === "top") {
    x = bbox.x + (bbox.w - w) / 2;
    y = bbox.y;
  } else if (side === "bottom") {
    x = bbox.x + (bbox.w - w) / 2;
    y = bbox.y + bbox.h - h;
  } else if (side === "inner") {
    x = bbox.x + bbox.w - w;
    y = bbox.y + (bbox.h - h) / 2;
  } else {
    x = bbox.x;
    y = bbox.y + (bbox.h - h) / 2;
  }
  const shape = wedgePath(x, y, w, h, side);
  return subtract(glyph.path_d, shape);
}

/** Apply seam cut (subtract diagonal band in bbox). */
export function applySeamCut(
  glyph: GlyphRun,
  params: { angle_deg: number; thickness: number; offset: number },
): string {
  const shape = diagonalBandPath(glyph.bbox, params.angle_deg, glyph.bbox.h * params.thickness, params.offset);
  return subtract(glyph.path_d, shape);
}

/** Apply ligature bridge between two glyphs (union rounded rect between bboxes). */
export function applyLigatureBridge(
  glyphA: GlyphRun,
  glyphB: GlyphRun,
  params: { thickness: number; y_pos: "baseline" | "xheight" | "cap" },
): string {
  const b1 = glyphA.bbox;
  const b2 = glyphB.bbox;
  const gap = b2.x - (b1.x + b1.w);
  const th = Math.max((b1.h + b2.h) / 2 * params.thickness, 1);
  let y: number;
  const midH = (b1.y + b1.h / 2 + b2.y + b2.h / 2) / 2;
  if (params.y_pos === "baseline") y = midH - th / 2;
  else if (params.y_pos === "cap") y = Math.min(b1.y, b2.y);
  else y = Math.min(b1.y + b1.h * 0.7, b2.y + b2.h * 0.7) - th / 2;
  const x = b1.x + b1.w;
  const w = Math.max(gap, 0.5);
  const bridgePath = roundedRectPath(x, y, w, th, th / 4);
  const combined = union(glyphA.path_d, bridgePath);
  return union(combined, glyphB.path_d);
}
