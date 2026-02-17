/**
 * Logo Quality Gate: Evaluates logo candidates and enforces quality thresholds.
 * Pure deterministic scoring - no AI calls.
 */

import { countPathCommands } from "../tools/fontToPath.tool";

export type LogoCandidate = {
  markSvg: string;
  wordmarkSvg: string;
  horizontal?: string;
  stacked?: string;
  metadata: {
    markFamily?: string;
    markVariant?: number;
    wordmarkFontFamily?: string;
    wordmarkWeight?: number;
    wordmarkTracking?: number;
  };
};

export type QualityScore = {
  total: number;
  breakdown: {
    legibility: number;
    ownability: number;
    boldness: number;
    coherence: number;
    craft: number;
  };
  failures: string[];
};

export type RankedCandidate = {
  candidate: LogoCandidate;
  score: QualityScore;
};

/**
 * Normalize SVG numbers to max 3 decimals and strip floating point artifacts
 */
export function normalizeSvgNumbers(svg: string): string {
  // Replace numbers with excessive precision
  return svg.replace(/(\d+\.\d{4,})/g, (match) => {
    const num = parseFloat(match);
    if (isNaN(num)) return match;
    // Round to 3 decimals, but preserve trailing zeros if significant
    const rounded = Math.round(num * 1000) / 1000;
    return rounded.toString();
  }).replace(/\.0{4,}\d+/g, ""); // Remove artifacts like .000000000000001
}

/**
 * Extract viewBox from SVG string
 */
function extractViewBox(svg: string): { x: number; y: number; w: number; h: number } | null {
  const viewBoxMatch = svg.match(/viewBox=["']([^"']+)["']/i);
  if (!viewBoxMatch) return null;
  const parts = viewBoxMatch[1]!.split(/\s+/).map(parseFloat);
  if (parts.length !== 4) return null;
  return { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! };
}

/**
 * Extract path data from SVG
 */
function extractPathData(svg: string): string[] {
  const pathMatches = svg.match(/<path[^>]*d=["']([^"']+)["']/gi);
  if (!pathMatches) return [];
  return pathMatches.map((m) => {
    const dMatch = m.match(/d=["']([^"']+)["']/i);
    return dMatch ? dMatch[1]! : "";
  }).filter(Boolean);
}

/**
 * Count unique coordinates in path data
 */
function countUniqueCoords(pathD: string): number {
  const coords = pathD.match(/[\d.]+/g) || [];
  const unique = new Set(coords.map((c) => parseFloat(c).toFixed(1)));
  return unique.size;
}

/**
 * Check if mark has internal counters (fill-rule=evenodd or multiple paths)
 */
function hasInternalCounters(svg: string): boolean {
  // Check for fill-rule="evenodd"
  if (/fill-rule=["']evenodd["']/i.test(svg)) return true;
  
  // Check for multiple paths (indicates complexity)
  const pathCount = (svg.match(/<path/gi) || []).length;
  return pathCount >= 2;
}

/**
 * Check if mark is just simple shapes (rectangles/circles)
 */
function isSimpleShape(svg: string): boolean {
  const hasRect = /<rect/i.test(svg);
  const hasCircle = /<circle/i.test(svg);
  const pathData = extractPathData(svg);
  
  if (hasRect || hasCircle) {
    // If only simple shapes with low complexity, it's too simple
    const totalCommands = pathData.reduce((sum, d) => sum + countPathCommands(d), 0);
    return totalCommands < 10;
  }
  
  return false;
}

/**
 * Score legibility (0-10)
 */
function scoreLegibility(wordmarkSvg: string): { score: number; failures: string[] } {
  const failures: string[] = [];
  let score = 10;
  
  // Extract all path data from wordmark
  const pathData = extractPathData(wordmarkSvg);
  const combinedPathD = pathData.join(" ");
  const commandCount = countPathCommands(combinedPathD);
  
  // Must have >= 120 path commands
  if (commandCount < 120) {
    failures.push(`Insufficient path commands: ${commandCount} < 120`);
    score -= 5;
  }
  
  // Check for unique coordinates (must have >= 10)
  const uniqueCoords = countUniqueCoords(combinedPathD);
  if (uniqueCoords < 10) {
    failures.push(`Too few unique coordinates: ${uniqueCoords} < 10`);
    score -= 3;
  }
  
  // Check aspect ratio
  const viewBox = extractViewBox(wordmarkSvg);
  if (viewBox) {
    const aspect = viewBox.w / Math.max(viewBox.h, 1);
    if (aspect < 2 || aspect > 14) {
      failures.push(`Aspect ratio out of range: ${aspect.toFixed(2)} (should be 2-14)`);
      score -= 2;
    }
    
    // Check if width is too small
    if (viewBox.w < 50) {
      failures.push(`Wordmark width too small: ${viewBox.w}`);
      score -= 2;
    }
  }
  
  return { score: Math.max(0, score), failures };
}

/**
 * Score ownability (0-10)
 */
function scoreOwnability(markSvg: string): { score: number; failures: string[] } {
  const failures: string[] = [];
  let score = 10;
  
  const pathData = extractPathData(markSvg);
  const pathCount = pathData.length;
  
  // Must have >= 2 paths OR be a filled single path with internal counters
  if (pathCount < 2) {
    if (!hasInternalCounters(markSvg)) {
      failures.push("Mark has only 1 path without internal counters");
      score -= 4;
    }
  }
  
  // Reject simple shapes
  if (isSimpleShape(markSvg)) {
    failures.push("Mark is only simple rectangles/circles");
    score -= 5;
  }
  
  // Check for low unique coordinates (indicates generic shape)
  const combinedPathD = pathData.join(" ");
  const uniqueCoords = countUniqueCoords(combinedPathD);
  if (uniqueCoords < 8) {
    failures.push(`Too few unique coordinates: ${uniqueCoords} < 8`);
    score -= 3;
  }
  
  // Reward asymmetry or interlock overlaps (detect repeated subpaths)
  // Simple heuristic: check if path has variation
  const commandCount = countPathCommands(combinedPathD);
  if (commandCount < 15) {
    failures.push(`Mark too simple: ${commandCount} commands < 15`);
    score -= 2;
  }
  
  return { score: Math.max(0, score), failures };
}

/**
 * Score boldness (0-10)
 */
function scoreBoldness(
  markSvg: string,
  wordmarkSvg: string,
  metadata: LogoCandidate["metadata"],
): { score: number; failures: string[] } {
  const failures: string[] = [];
  let score = 10;
  
  // Check mark fill
  const hasFill = /fill=["'][^"']*["']/i.test(markSvg) && !/fill=["']none["']/i.test(markSvg);
  if (!hasFill) {
    // Check stroke width
    const strokeMatch = markSvg.match(/stroke-width=["']([^"']+)["']/i);
    const strokeWidth = strokeMatch ? parseFloat(strokeMatch[1]!) : 0;
    const viewBox = extractViewBox(markSvg);
    const grid = viewBox ? Math.max(viewBox.w, viewBox.h) : 640;
    const minStroke = (grid / 640) * 6;
    if (strokeWidth < minStroke) {
      failures.push(`Stroke width too thin: ${strokeWidth} < ${minStroke.toFixed(2)}`);
      score -= 3;
    }
  }
  
  // Check wordmark weight
  const weight = metadata.wordmarkWeight || 400;
  if (weight < 700) {
    failures.push(`Wordmark weight too light: ${weight} < 700`);
    score -= 2;
  }
  
  // Check tracking (low tracking = bolder)
  const tracking = metadata.wordmarkTracking || 0;
  if (tracking > 5) {
    failures.push(`Wordmark tracking too loose: ${tracking} > 5`);
    score -= 1;
  }
  
  return { score: Math.max(0, score), failures };
}

/**
 * Score coherence (0-10) - how well logo matches direction keywords
 */
function scoreCoherence(
  markSvg: string,
  directionKeywords: string[],
): { score: number; failures: string[] } {
  const failures: string[] = [];
  let score = 10;
  
  const keywordsLower = directionKeywords.map((k) => k.toLowerCase()).join(" ");
  
  // Check for interlock/connect keywords
  if (/interlock|connect|link|unite|join|bridge/i.test(keywordsLower)) {
    const hasInterlock = /interlock/i.test(markSvg) || 
                         (extractPathData(markSvg).length >= 2 && 
                          markSvg.match(/fill-rule=["']evenodd["']/i));
    if (!hasInterlock) {
      failures.push("Direction suggests interlock but mark doesn't show interlock structure");
      score -= 2;
    }
  }
  
  // Check for swap/exchange keywords
  if (/swap|exchange|trade|transfer|switch/i.test(keywordsLower)) {
    // Look for opposing motion or symmetry breaking
    const pathData = extractPathData(markSvg);
    if (pathData.length < 2) {
      failures.push("Direction suggests swap but mark lacks opposing elements");
      score -= 2;
    }
  }
  
  // Check for fold/crease keywords
  if (/fold|crease|bend|angle|corner|sharp/i.test(keywordsLower)) {
    const hasDiagonal = /<path[^>]*d=["'][^"']*[LM][^"']*\d+[,\s]\d+[^"']*[LM][^"']*\d+[,\s]\d+/i.test(markSvg);
    if (!hasDiagonal) {
      failures.push("Direction suggests fold but mark lacks diagonal/seam elements");
      score -= 1;
    }
  }
  
  return { score: Math.max(0, score), failures };
}

/**
 * Score craft (0-10) - technical quality
 */
function scoreCraft(markSvg: string, wordmarkSvg: string): { score: number; failures: string[] } {
  const failures: string[] = [];
  let score = 10;
  
  // Check for floating point artifacts
  const hasArtifacts = /\.\d{4,}/.test(markSvg) || /\.\d{4,}/.test(wordmarkSvg);
  if (hasArtifacts) {
    failures.push("SVG contains floating point artifacts (excessive precision)");
    score -= 2;
  }
  
  // Check mark bbox centering
  const markViewBox = extractViewBox(markSvg);
  if (markViewBox) {
    const centerX = markViewBox.x + markViewBox.w / 2;
    const centerY = markViewBox.y + markViewBox.h / 2;
    const expectedCenterX = markViewBox.w / 2;
    const expectedCenterY = markViewBox.h / 2;
    
    const offsetX = Math.abs(centerX - expectedCenterX);
    const offsetY = Math.abs(centerY - expectedCenterY);
    const maxOffset = Math.max(markViewBox.w, markViewBox.h) * 0.1; // 10% tolerance
    
    if (offsetX > maxOffset || offsetY > maxOffset) {
      failures.push(`Mark bbox off-center: offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);
      score -= 1;
    }
    
    // Check if mark is too small
    const minSize = 100;
    if (markViewBox.w < minSize || markViewBox.h < minSize) {
      failures.push(`Mark too small: ${markViewBox.w}x${markViewBox.h} < ${minSize}x${minSize}`);
      score -= 1;
    }
  }
  
  return { score: Math.max(0, score), failures };
}

/**
 * Score a logo candidate
 */
export function scoreLogoCandidate(
  candidate: LogoCandidate,
  directionKeywords: string[],
): QualityScore {
  // Normalize SVG numbers
  const normalizedMark = normalizeSvgNumbers(candidate.markSvg);
  const normalizedWordmark = normalizeSvgNumbers(candidate.wordmarkSvg);
  
  const legibility = scoreLegibility(normalizedWordmark);
  const ownability = scoreOwnability(normalizedMark);
  const boldness = scoreBoldness(normalizedMark, normalizedWordmark, candidate.metadata);
  const coherence = scoreCoherence(normalizedMark, directionKeywords);
  const craft = scoreCraft(normalizedMark, normalizedWordmark);
  
  // Weighted sum: legibility 25%, ownability 30%, boldness 20%, coherence 15%, craft 10%
  const total = 
    legibility.score * 0.25 +
    ownability.score * 0.30 +
    boldness.score * 0.20 +
    coherence.score * 0.15 +
    craft.score * 0.10;
  
  const allFailures = [
    ...legibility.failures,
    ...ownability.failures,
    ...boldness.failures,
    ...coherence.failures,
    ...craft.failures,
  ];
  
  return {
    total,
    breakdown: {
      legibility: legibility.score,
      ownability: ownability.score,
      boldness: boldness.score,
      coherence: coherence.score,
      craft: craft.score,
    },
    failures: allFailures,
  };
}

/**
 * Pass threshold: total >= 7.6 AND legibility >= 7 AND ownability >= 7
 */
export function passesQualityGate(score: QualityScore): boolean {
  return score.total >= 7.6 && 
         score.breakdown.legibility >= 7 && 
         score.breakdown.ownability >= 7;
}

/**
 * Rank candidates by score
 */
export function pickBest(candidates: RankedCandidate[]): {
  best: RankedCandidate;
  ranked: RankedCandidate[];
} {
  const ranked = [...candidates].sort((a, b) => b.score.total - a.score.total);
  return {
    best: ranked[0]!,
    ranked,
  };
}
