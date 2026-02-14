/**
 * Main entry: customizeWordmark(input). Deterministic, parametric glyph-level modifications.
 */

import type {
  WordmarkCustomizeInput,
  WordmarkCustomizeOutput,
  WordmarkCustomizationPlan,
  DeviceSpec,
  GlyphRun,
  DeviceManifestItem,
} from "./types";
import { applyNotchCut, applySeamCut, applyLigatureBridge } from "./devices";
import { computeMetrics } from "./metrics";
import { pathDToPolygons, polygonsToPathD, type Polygon } from "./geometry";

function normalizePlan(plan: WordmarkCustomizationPlan): WordmarkCustomizationPlan {
  return {
    ...plan,
    target_letters: plan.target_letters.map((l) => l.toLowerCase()),
    devices: plan.devices.map((d) => {
      if (d.target === "single" && "letter" in d) return { ...d, letter: d.letter.toLowerCase() };
      if (d.target === "pair") return { ...d, from: d.from.toLowerCase(), to: d.to.toLowerCase() };
      return d;
    }),
  };
}

/** Scale path_d by scaleX around center cx. */
function scalePathX(pathD: string, scaleX: number, cx: number): string {
  const polys = pathDToPolygons(pathD, 80);
  const scaled: Polygon[] = polys.map((poly) =>
    poly.map(([x, y]) => [(x - cx) * scaleX + cx, y] as [number, number]),
  );
  return polygonsToPathD(scaled);
}

/** Find first glyph index matching letter (case-insensitive), not in used set. */
function findGlyphIndex(glyphs: GlyphRun[], letter: string, used: Set<number>): number {
  const l = letter.toLowerCase();
  for (let i = 0; i < glyphs.length; i++) {
    if (glyphs[i]!.char.toLowerCase() === l && !used.has(i)) return i;
  }
  return -1;
}

export function customizeWordmark(input: WordmarkCustomizeInput): WordmarkCustomizeOutput {
  const { base, plan, seed: _seed } = input;
  const planNorm = normalizePlan(plan);
  const glyphs = base.glyphs.map((g) => ({ ...g, path_d: g.path_d }));

  const vbParts = base.viewBox.split(/\s+/);
  const cx = vbParts.length >= 1 ? parseFloat(vbParts[0]!) + parseFloat(vbParts[2]!) / 2 : base.width / 2;

  if (planNorm.boldness.compression !== 1) {
    for (let i = 0; i < glyphs.length; i++) {
      glyphs[i]!.path_d = scalePathX(glyphs[i]!.path_d, planNorm.boldness.compression, cx);
    }
  }

  const used = new Set<number>();
  const manifest: DeviceManifestItem[] = [];

  for (const dev of planNorm.devices) {
    if (dev.kind === "notch_cut") {
      const idx = findGlyphIndex(glyphs, dev.letter, used);
      if (idx >= 0) {
        try {
          glyphs[idx]!.path_d = applyNotchCut(glyphs[idx]!, { side: dev.side, depth: dev.depth, width: dev.width });
          used.add(idx);
          manifest.push({ device: "notch_cut", target: dev.letter, applied: true });
        } catch {
          manifest.push({ device: "notch_cut", target: dev.letter, applied: false });
        }
      } else manifest.push({ device: "notch_cut", target: dev.letter, applied: false });
    } else if (dev.kind === "seam_cut") {
      const idx = findGlyphIndex(glyphs, dev.letter, used);
      if (idx >= 0) {
        try {
          glyphs[idx]!.path_d = applySeamCut(glyphs[idx]!, {
            angle_deg: dev.angle_deg,
            thickness: dev.thickness,
            offset: dev.offset,
          });
          used.add(idx);
          manifest.push({ device: "seam_cut", target: dev.letter, applied: true });
        } catch {
          manifest.push({ device: "seam_cut", target: dev.letter, applied: false });
        }
      } else manifest.push({ device: "seam_cut", target: dev.letter, applied: false });
    } else if (dev.kind === "ligature_bridge") {
      const ia = findGlyphIndex(glyphs, dev.from, used);
      const ib = findGlyphIndex(glyphs, dev.to, used);
      if (ia >= 0 && ib >= 0 && ia !== ib) {
        try {
          const combined = applyLigatureBridge(glyphs[ia]!, glyphs[ib]!, {
            thickness: dev.thickness,
            y_pos: dev.y_pos,
          });
          glyphs[ia]!.path_d = combined;
          glyphs[ib]!.path_d = "";
          used.add(ia);
          used.add(ib);
          manifest.push({ device: "ligature_bridge", target: `${dev.from}-${dev.to}`, applied: true });
        } catch {
          manifest.push({ device: "ligature_bridge", target: `${dev.from}-${dev.to}`, applied: false });
        }
      } else manifest.push({ device: "ligature_bridge", target: `${dev.from}-${dev.to}`, applied: false });
    }
  }

  const combinedPathD = glyphs.map((g) => g.path_d).filter(Boolean).join(" ");
  const originalArea = pathDToPolygons(base.path_d, 60).reduce((acc, p) => {
    let area = 0;
    const n = p.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += p[i]![0]! * p[j]![1]! - p[j]![0]! * p[i]![1]!;
    }
    return acc + Math.abs(area) / 2;
  }, 0);

  let metrics = computeMetrics(base.path_d, combinedPathD || base.path_d, originalArea);

  if (metrics.device_visibility < 6 || metrics.default_font_risk > 95) {
    const intensified = planNorm.devices.map((d) => {
      if (d.kind === "notch_cut") return { ...d, depth: d.depth * 1.2, width: d.width * 1.2 };
      if (d.kind === "seam_cut") return { ...d, thickness: d.thickness * 1.2 };
      if (d.kind === "ligature_bridge") return { ...d, thickness: d.thickness * 1.15 };
      return d;
    });
    const glyphs2 = base.glyphs.map((g) => ({ ...g, path_d: g.path_d }));
    if (planNorm.boldness.compression !== 1) {
      for (let i = 0; i < glyphs2.length; i++) {
        glyphs2[i]!.path_d = scalePathX(glyphs2[i]!.path_d, planNorm.boldness.compression, cx);
      }
    }
    const used2 = new Set<number>();
    for (const dev of intensified) {
      if (dev.kind === "notch_cut") {
        const idx = findGlyphIndex(glyphs2, dev.letter, used2);
        if (idx >= 0) {
          try {
            glyphs2[idx]!.path_d = applyNotchCut(glyphs2[idx]!, { side: dev.side, depth: dev.depth, width: dev.width });
            used2.add(idx);
          } catch {}
        }
      } else if (dev.kind === "seam_cut") {
        const idx = findGlyphIndex(glyphs2, dev.letter, used2);
        if (idx >= 0) {
          try {
            glyphs2[idx]!.path_d = applySeamCut(glyphs2[idx]!, { angle_deg: dev.angle_deg, thickness: dev.thickness, offset: dev.offset });
            used2.add(idx);
          } catch {}
        }
      } else if (dev.kind === "ligature_bridge") {
        const ia = findGlyphIndex(glyphs2, dev.from, used2);
        const ib = findGlyphIndex(glyphs2, dev.to, used2);
        if (ia >= 0 && ib >= 0 && ia !== ib) {
          try {
            const combined = applyLigatureBridge(glyphs2[ia]!, glyphs2[ib]!, { thickness: dev.thickness, y_pos: dev.y_pos });
            glyphs2[ia]!.path_d = combined;
            glyphs2[ib]!.path_d = "";
            used2.add(ia);
            used2.add(ib);
          } catch {}
        }
      }
    }
    const combined2 = glyphs2.map((g) => g.path_d).filter(Boolean).join(" ");
    if (combined2) {
      metrics = computeMetrics(base.path_d, combined2, originalArea);
      const finalPath = combined2;
      const [vx, vy, vw, vh] = base.viewBox.split(/\s+/).map(Number);
      const wordmark_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" fill="currentColor"><path d="${finalPath.replace(/"/g, "'")}"/></svg>`;
      return {
        wordmark_path_d: finalPath,
        wordmark_svg,
        manifest,
        metrics,
      };
    }
  }

  const finalPath = combinedPathD || base.path_d;
  const [vx, vy, vw, vh] = base.viewBox.split(/\s+/).map(Number);
  const wordmark_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vx} ${vy} ${vw} ${vh}" fill="currentColor"><path d="${finalPath.replace(/"/g, "'")}"/></svg>`;
  return {
    wordmark_path_d: finalPath,
    wordmark_svg,
    manifest,
    metrics,
  };
}
