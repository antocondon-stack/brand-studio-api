/**
 * Deterministic metrics: device_visibility, silhouette_delta, default_font_risk, legibility (0-100).
 */

import type { WordmarkMetrics } from "./types";
import { pathDToPolygons } from "./geometry";

/** Approximate polygon area (shoelace). */
function polygonArea(poly: [number, number][]): number {
  let area = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += poly[i]![0]! * poly[j]![1]!;
    area -= poly[j]![0]! * poly[i]![1]!;
  }
  return Math.abs(area) / 2;
}

/** Sum area of all polygons from path d. */
function pathArea(pathD: string): number {
  const polys = pathDToPolygons(pathD, 60);
  return polys.reduce((acc, p) => acc + polygonArea(p), 0);
}

/**
 * Compute metrics given original and modified path d (and optional original area for legibility).
 */
export function computeMetrics(
  originalPathD: string,
  modifiedPathD: string,
  originalArea?: number,
): WordmarkMetrics {
  const areaOrig = originalArea ?? pathArea(originalPathD);
  const areaMod = pathArea(modifiedPathD);
  const areaDelta = areaOrig - areaMod;
  const areaDeltaRatio = areaOrig > 0 ? Math.abs(areaDelta) / areaOrig : 0;

  const device_visibility = Math.min(100, Math.max(0, areaDeltaRatio * 100));
  const silhouette_delta = areaDeltaRatio >= 0.02 ? 100 : 0;
  const default_font_risk = Math.min(100, Math.max(0, (1 - areaDeltaRatio) * 100));
  let legibility = 100;
  if (areaDelta > 0 && areaOrig > 0 && areaDelta / areaOrig > 0.35) legibility = Math.max(0, 100 - (areaDelta / areaOrig) * 150);
  legibility = Math.min(100, Math.max(0, legibility));

  return {
    device_visibility,
    silhouette_delta,
    default_font_risk,
    legibility,
  };
}
