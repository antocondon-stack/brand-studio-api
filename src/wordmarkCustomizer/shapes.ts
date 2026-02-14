/**
 * Shape path generators in glyph bbox coordinate space (for cuts/bridges).
 */

/** Rectangle path: M x y L x+w y L x+w y+h L x y+h Z */
export function rectPath(x: number, y: number, w: number, h: number): string {
  return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}

/** Wedge (triangle) for notch. side: which edge the apex is on. */
export function wedgePath(x: number, y: number, w: number, h: number, side: "inner" | "outer" | "top" | "bottom"): string {
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (side === "top") return `M ${x} ${y + h} L ${x + w} ${y + h} L ${cx} ${y} Z`;
  if (side === "bottom") return `M ${x} ${y} L ${cx} ${y + h} L ${x + w} ${y} Z`;
  if (side === "inner") return `M ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${cy} Z`;
  return `M ${x} ${y} L ${x} ${y + h} L ${x + w} ${cy} Z`;
}

/** Diagonal band (parallelogram) across bbox. angle_deg, thickness (height of band), offset. */
export function diagonalBandPath(
  bbox: { x: number; y: number; w: number; h: number },
  angle_deg: number,
  thickness: number,
  offset: number,
): string {
  const { x, y, w, h } = bbox;
  const rad = (angle_deg * Math.PI) / 180;
  const dx = Math.cos(rad) * (w + h);
  const dy = Math.sin(rad) * (w + h);
  const px = x + offset;
  const py = y + offset;
  const t = thickness;
  const perpX = -Math.sin(rad) * t;
  const perpY = Math.cos(rad) * t;
  const x1 = px;
  const y1 = py;
  const x2 = px + dx;
  const y2 = py + dy;
  const x3 = x2 + perpX;
  const y3 = y2 + perpY;
  const x4 = x1 + perpX;
  const y4 = y1 + perpY;
  return `M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3} L ${x4} ${y4} Z`;
}

/** Rounded rect for ligature bridge. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  if (r <= 0 || r >= w / 2 || r >= h / 2) return rectPath(x, y, w, h);
  return `M ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} L ${x + r} ${y + h} Q ${x} ${y + h} ${x} ${y + h - r} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} Z`;
}
