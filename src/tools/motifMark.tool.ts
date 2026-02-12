interface MotifOptions {
  family: "loop" | "interlock" | "orbit" | "fold" | "swap";
  strokeWidth?: number;
  cornerRadius?: number;
  gridSize?: number;
  seed?: number;
}

/**
 * Generates deterministic SVG motif marks based on family type
 * All motifs use a consistent 24x24 grid by default
 */
export function generateMotifMark(options: MotifOptions): string {
  const {
    family,
    strokeWidth = 2,
    cornerRadius = 2,
    gridSize = 24,
    seed = 0,
  } = options;

  // Use seed to create deterministic variations
  const variation = seed % 4;

  switch (family) {
    case "loop":
      return generateLoopMotif(gridSize, strokeWidth, cornerRadius, variation);
    case "interlock":
      return generateInterlockMotif(gridSize, strokeWidth, cornerRadius, variation);
    case "orbit":
      return generateOrbitMotif(gridSize, strokeWidth, cornerRadius, variation);
    case "fold":
      return generateFoldMotif(gridSize, strokeWidth, cornerRadius, variation);
    case "swap":
      return generateSwapMotif(gridSize, strokeWidth, cornerRadius, variation);
    default:
      return generateLoopMotif(gridSize, strokeWidth, cornerRadius, 0);
  }
}

/**
 * Loop motif: Continuous looping paths
 */
function generateLoopMotif(
  gridSize: number,
  strokeWidth: number,
  cornerRadius: number,
  variation: number,
): string {
  const center = gridSize / 2;
  const paths: string[] = [];

  switch (variation) {
    case 0:
      // Single large loop
      paths.push(
        `M ${center - 6} ${center} A 6 6 0 1 1 ${center + 6} ${center} A 6 6 0 1 1 ${center - 6} ${center}`,
      );
      break;
    case 1:
      // Double loop
      paths.push(
        `M ${center - 8} ${center - 4} A 4 4 0 1 1 ${center} ${center - 4} A 4 4 0 1 1 ${center + 8} ${center - 4}`,
      );
      paths.push(
        `M ${center - 8} ${center + 4} A 4 4 0 1 0 ${center} ${center + 4} A 4 4 0 1 0 ${center + 8} ${center + 4}`,
      );
      break;
    case 2:
      // Triple nested loops
      paths.push(`M ${center} ${center - 6} A 6 6 0 1 1 ${center} ${center + 6} A 6 6 0 1 1 ${center} ${center - 6}`);
      paths.push(`M ${center} ${center - 4} A 4 4 0 1 0 ${center} ${center + 4} A 4 4 0 1 0 ${center} ${center - 4}`);
      paths.push(`M ${center} ${center - 2} A 2 2 0 1 1 ${center} ${center + 2} A 2 2 0 1 1 ${center} ${center - 2}`);
      break;
    case 3:
      // Spiral loop
      paths.push(
        `M ${center} ${center} L ${center + 2} ${center} A 2 2 0 0 1 ${center + 2} ${center + 2} A 4 4 0 0 1 ${center - 2} ${center + 2} A 6 6 0 0 1 ${center - 6} ${center - 2} A 4 4 0 0 1 ${center - 2} ${center - 6} Z`,
      );
      break;
  }

  return paths.join(" ");
}

/**
 * Interlock motif: Interconnected geometric shapes
 */
function generateInterlockMotif(
  gridSize: number,
  strokeWidth: number,
  cornerRadius: number,
  variation: number,
): string {
  const center = gridSize / 2;
  const paths: string[] = [];

  switch (variation) {
    case 0:
      // Simple interlock (two overlapping circles)
      paths.push(`M ${center - 4} ${center} A 4 4 0 1 1 ${center + 4} ${center} A 4 4 0 1 1 ${center - 4} ${center}`);
      paths.push(`M ${center} ${center - 4} A 4 4 0 1 1 ${center} ${center + 4} A 4 4 0 1 1 ${center} ${center - 4}`);
      break;
    case 1:
      // Triple interlock
      const angle1 = (Math.PI * 2) / 3;
      const angle2 = (Math.PI * 4) / 3;
      const r = 4;
      paths.push(`M ${center + r * Math.cos(0)} ${center + r * Math.sin(0)} A 4 4 0 1 1 ${center + r * Math.cos(angle1)} ${center + r * Math.sin(angle1)} A 4 4 0 1 1 ${center + r * Math.cos(angle2)} ${center + r * Math.sin(angle2)} Z`);
      break;
    case 2:
      // Square interlock
      const size = 5;
      paths.push(`M ${center - size} ${center - size} L ${center + size} ${center - size} L ${center + size} ${center + size} L ${center - size} ${center + size} Z`);
      paths.push(`M ${center - size + 2} ${center} L ${center} ${center - size + 2} L ${center + size - 2} ${center} L ${center} ${center + size - 2} Z`);
      break;
    case 3:
      // Hexagon interlock
      const hexR = 5;
      const hexPoints: string[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = center + hexR * Math.cos(angle);
        const y = center + hexR * Math.sin(angle);
        hexPoints.push(`${x} ${y}`);
      }
      paths.push(`M ${hexPoints.join(" L ")} Z`);
      break;
  }

  return paths.join(" ");
}

/**
 * Orbit motif: Concentric or orbital paths
 */
function generateOrbitMotif(
  gridSize: number,
  strokeWidth: number,
  cornerRadius: number,
  variation: number,
): string {
  const center = gridSize / 2;
  const paths: string[] = [];

  switch (variation) {
    case 0:
      // Concentric circles
      paths.push(`M ${center} ${center - 6} A 6 6 0 1 1 ${center} ${center + 6} A 6 6 0 1 1 ${center} ${center - 6}`);
      paths.push(`M ${center} ${center - 4} A 4 4 0 1 0 ${center} ${center + 4} A 4 4 0 1 0 ${center} ${center - 4}`);
      paths.push(`M ${center} ${center - 2} A 2 2 0 1 1 ${center} ${center + 2} A 2 2 0 1 1 ${center} ${center - 2}`);
      break;
    case 1:
      // Elliptical orbits
      paths.push(`M ${center - 7} ${center} A 7 4 0 1 1 ${center + 7} ${center} A 7 4 0 1 1 ${center - 7} ${center}`);
      paths.push(`M ${center} ${center - 5} A 4 5 0 1 0 ${center} ${center + 5} A 4 5 0 1 0 ${center} ${center - 5}`);
      break;
    case 2:
      // Offset orbits
      paths.push(`M ${center - 2} ${center - 6} A 6 6 0 1 1 ${center - 2} ${center + 6} A 6 6 0 1 1 ${center - 2} ${center - 6}`);
      paths.push(`M ${center + 2} ${center - 4} A 4 4 0 1 0 ${center + 2} ${center + 4} A 4 4 0 1 0 ${center + 2} ${center - 4}`);
      break;
    case 3:
      // Spiral orbit
      paths.push(
        `M ${center} ${center} L ${center + 1} ${center} A 1 1 0 0 1 ${center + 1} ${center + 1} A 2 2 0 0 1 ${center - 1} ${center + 1} A 3 3 0 0 1 ${center - 3} ${center - 1} A 4 4 0 0 1 ${center + 1} ${center - 5} A 5 5 0 0 1 ${center + 6} ${center}`,
      );
      break;
  }

  return paths.join(" ");
}

/**
 * Fold motif: Geometric folding patterns
 */
function generateFoldMotif(
  gridSize: number,
  strokeWidth: number,
  cornerRadius: number,
  variation: number,
): string {
  const center = gridSize / 2;
  const paths: string[] = [];

  switch (variation) {
    case 0:
      // Simple fold (triangle)
      paths.push(`M ${center} ${center - 6} L ${center - 6} ${center + 6} L ${center + 6} ${center + 6} Z`);
      break;
    case 1:
      // Double fold
      paths.push(`M ${center} ${center - 6} L ${center - 6} ${center} L ${center} ${center + 6} L ${center + 6} ${center} Z`);
      break;
    case 2:
      // Origami fold
      paths.push(`M ${center} ${center - 6} L ${center - 4} ${center - 2} L ${center} ${center + 2} L ${center + 4} ${center - 2} Z`);
      paths.push(`M ${center - 4} ${center - 2} L ${center - 6} ${center + 4} L ${center} ${center + 2} Z`);
      paths.push(`M ${center + 4} ${center - 2} L ${center + 6} ${center + 4} L ${center} ${center + 2} Z`);
      break;
    case 3:
      // Complex fold pattern
      paths.push(`M ${center - 6} ${center - 6} L ${center} ${center} L ${center - 6} ${center + 6} Z`);
      paths.push(`M ${center + 6} ${center - 6} L ${center} ${center} L ${center + 6} ${center + 6} Z`);
      paths.push(`M ${center - 6} ${center} L ${center} ${center - 6} L ${center + 6} ${center} L ${center} ${center + 6} Z`);
      break;
  }

  return paths.join(" ");
}

/**
 * Swap motif: Swapping or alternating patterns
 */
function generateSwapMotif(
  gridSize: number,
  strokeWidth: number,
  cornerRadius: number,
  variation: number,
): string {
  const center = gridSize / 2;
  const paths: string[] = [];

  switch (variation) {
    case 0:
      // Alternating squares
      paths.push(`M ${center - 6} ${center - 6} L ${center - 2} ${center - 6} L ${center - 2} ${center - 2} L ${center - 6} ${center - 2} Z`);
      paths.push(`M ${center + 2} ${center + 2} L ${center + 6} ${center + 2} L ${center + 6} ${center + 6} L ${center + 2} ${center + 6} Z`);
      break;
    case 1:
      // Swapped circles
      paths.push(`M ${center - 6} ${center} A 3 3 0 1 1 ${center - 6} ${center + 0.1} A 3 3 0 1 1 ${center - 6} ${center}`);
      paths.push(`M ${center + 6} ${center} A 3 3 0 1 0 ${center + 6} ${center + 0.1} A 3 3 0 1 0 ${center + 6} ${center}`);
      break;
    case 2:
      // Diagonal swap
      paths.push(`M ${center - 6} ${center - 6} L ${center - 2} ${center - 2} L ${center - 6} ${center + 2} Z`);
      paths.push(`M ${center + 6} ${center + 6} L ${center + 2} ${center + 2} L ${center + 6} ${center - 2} Z`);
      break;
    case 3:
      // Cross swap
      paths.push(`M ${center - 6} ${center - 2} L ${center - 2} ${center - 2} L ${center - 2} ${center - 6} L ${center + 2} ${center - 6} L ${center + 2} ${center - 2} L ${center + 6} ${center - 2} L ${center + 6} ${center + 2} L ${center + 2} ${center + 2} L ${center + 2} ${center + 6} L ${center - 2} ${center + 6} L ${center - 2} ${center + 2} Z`);
      break;
  }

  return paths.join(" ");
}

/**
 * Generates a complete SVG motif mark
 */
export function createMotifMarkSVG(
  motifPath: string,
  gridSize: number = 24,
  fillColor: string = "#000000",
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${gridSize}" height="${gridSize}" viewBox="0 0 ${gridSize} ${gridSize}" role="img">
  <path d="${motifPath}" fill="none" stroke="${fillColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`.trim();
}

/**
 * Score a motif based on distinctiveness characteristics
 */
export function scoreMotifDistinctiveness(
  motifFamily: "loop" | "interlock" | "orbit" | "fold" | "swap",
  distinctivenessHook: string,
): number {
  const hook = distinctivenessHook.toLowerCase();
  let score = 0;

  // Score based on keyword matching
  if (hook.includes("loop") || hook.includes("circular") || hook.includes("flow")) {
    score += motifFamily === "loop" ? 10 : motifFamily === "orbit" ? 8 : 0;
  }
  if (hook.includes("interlock") || hook.includes("connect") || hook.includes("link")) {
    score += motifFamily === "interlock" ? 10 : 0;
  }
  if (hook.includes("orbit") || hook.includes("circle") || hook.includes("round")) {
    score += motifFamily === "orbit" ? 10 : motifFamily === "loop" ? 6 : 0;
  }
  if (hook.includes("fold") || hook.includes("origami") || hook.includes("geometric")) {
    score += motifFamily === "fold" ? 10 : motifFamily === "interlock" ? 6 : 0;
  }
  if (hook.includes("swap") || hook.includes("alternate") || hook.includes("dynamic")) {
    score += motifFamily === "swap" ? 10 : 0;
  }

  // Base scores for each family
  const baseScores: Record<"loop" | "interlock" | "orbit" | "fold" | "swap", number> = {
    loop: 5,
    interlock: 6,
    orbit: 5,
    fold: 7,
    swap: 6,
  };

  return score + (baseScores[motifFamily] ?? 5);
}
