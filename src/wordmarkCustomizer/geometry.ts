/**
 * Minimal polygon boolean ops using clipper-lib (pure JS). Even-odd fill.
 * pathDToPolygons approximates bezier curves by sampling.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ClipperLib = require("clipper-lib") as {
  Clipper: new () => { AddPath: (pg: { X: number; Y: number }[], polyType: number, closed: boolean) => void; Execute: (ct: number, solution: { X: number; Y: number }[][], a: number, b: number) => boolean };
  IntPoint: new (x: number, y: number) => { X: number; Y: number };
  PolyType: { ptSubject: number; ptClip: number };
  ClipType: { ctUnion: number; ctDifference: number };
  PolyFillType: { pftEvenOdd: number };
};

const SCALE = 1e5;

export type Polygon = [number, number][];

/** Sample a cubic bezier (0..1) into points. */
function sampleCubic(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  samples: number,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    const u2 = u * u;
    const u3 = u2 * u;
    const t2 = t * t;
    const t3 = t2 * t;
    const x = u3 * x0 + 3 * u2 * t * x1 + 3 * u * t2 * x2 + t3 * x3;
    const y = u3 * y0 + 3 * u2 * t * y1 + 3 * u * t2 * y2 + t3 * y3;
    out.push([x, y]);
  }
  return out;
}

/** Parse path d into commands (M/L/C/Q/Z) and approximate to polygons. */
export function pathDToPolygons(pathD: string, samples = 120): Polygon[] {
  const polygons: Polygon[] = [];
  const tokens = (pathD.replace(/,/g, " ").match(/-?[\d.e]+|[MLCQAZ]/gi) || []).filter(Boolean);
  let i = 0;
  let current: [number, number][] = [];
  let x = 0,
    y = 0;
  let startX = 0,
    startY = 0;

  const nextNum = (): number => {
    const v = parseFloat(tokens[i++] ?? "0");
    return Number.isFinite(v) ? v : 0;
  };

  while (i < tokens.length) {
    const cmd = (tokens[i++] ?? "M").toUpperCase();
    if (cmd === "M") {
      if (current.length >= 2) polygons.push([...current]);
      current = [];
      x = nextNum();
      y = nextNum();
      startX = x;
      startY = y;
      current.push([x, y]);
    } else if (cmd === "L") {
      x = nextNum();
      y = nextNum();
      current.push([x, y]);
    } else if (cmd === "C") {
      const x1 = nextNum(),
        y1 = nextNum(),
        x2 = nextNum(),
        y2 = nextNum();
      x = nextNum();
      y = nextNum();
      const pts = sampleCubic(current[current.length - 1]![0], current[current.length - 1]![1], x1, y1, x2, y2, x, y, Math.max(2, Math.floor(samples / 10)));
      for (let k = 1; k < pts.length; k++) current.push(pts[k]!);
    } else if (cmd === "Q") {
      const x1 = nextNum(),
        y1 = nextNum();
      x = nextNum();
      y = nextNum();
      const [x0, y0] = current[current.length - 1]!;
      const pts: [number, number][] = [];
      for (let k = 0; k <= Math.max(2, Math.floor(samples / 15)); k++) {
        const t = k / Math.max(2, Math.floor(samples / 15));
        const u = 1 - t;
        pts.push([u * u * x0 + 2 * u * t * x1 + t * t * x, u * u * y0 + 2 * u * t * y1 + t * t * y]);
      }
      for (let k = 1; k < pts.length; k++) current.push(pts[k]!);
    } else if (cmd === "Z") {
      if (current.length >= 2) {
        current.push([startX, startY]);
        polygons.push([...current]);
      }
      current = [];
    }
  }
  if (current.length >= 2) polygons.push([...current]);
  return polygons;
}

/** Convert polygons to path d (M/L/Z, even-odd). */
export function polygonsToPathD(polys: Polygon[]): string {
  const parts: string[] = [];
  for (const poly of polys) {
    if (poly.length < 2) continue;
    parts.push(`M ${poly[0]![0]} ${poly[0]![1]}`);
    for (let i = 1; i < poly.length; i++) parts.push(`L ${poly[i]![0]} ${poly[i]![1]}`);
    parts.push("Z");
  }
  return parts.join(" ");
}

function toIntPath(poly: Polygon): { X: number; Y: number }[] {
  return poly.map(([a, b]) => new ClipperLib.IntPoint(Math.round(a * SCALE), Math.round(b * SCALE)));
}

function fromIntPath(points: { X: number; Y: number }[]): Polygon {
  return points.map((p) => [p.X / SCALE, p.Y / SCALE] as [number, number]);
}

/** Union of path d shapes (subject union clip). */
export function union(pathD: string, shapePathD: string): string {
  const subjPolys = pathDToPolygons(pathD);
  const clipPolys = pathDToPolygons(shapePathD);
  const c = new ClipperLib.Clipper();
  const solution: { X: number; Y: number }[][] = [];

  for (const poly of subjPolys) {
    const pg = toIntPath(poly);
    if (pg.length >= 3) c.AddPath(pg, ClipperLib.PolyType.ptSubject, true);
  }
  for (const poly of clipPolys) {
    const pg = toIntPath(poly);
    if (pg.length >= 3) c.AddPath(pg, ClipperLib.PolyType.ptClip, true);
  }
  c.Execute(ClipperLib.ClipType.ctUnion, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);

  const resultPolys: Polygon[] = solution.map((p) => fromIntPath(p));
  return polygonsToPathD(resultPolys);
}

/** Subtract shapePathD from pathD (subject - clip). */
export function subtract(pathD: string, shapePathD: string): string {
  const subjPolys = pathDToPolygons(pathD);
  const clipPolys = pathDToPolygons(shapePathD);
  const c = new ClipperLib.Clipper();
  const solution: { X: number; Y: number }[][] = [];

  for (const poly of subjPolys) {
    const pg = toIntPath(poly);
    if (pg.length >= 3) c.AddPath(pg, ClipperLib.PolyType.ptSubject, true);
  }
  for (const poly of clipPolys) {
    const pg = toIntPath(poly);
    if (pg.length >= 3) c.AddPath(pg, ClipperLib.PolyType.ptClip, true);
  }
  c.Execute(ClipperLib.ClipType.ctDifference, solution, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);

  const resultPolys: Polygon[] = solution.map((p) => fromIntPath(p));
  return polygonsToPathD(resultPolys);
}
