/**
 * SVG utility functions
 */

/**
 * Normalize SVG numbers to max 3 decimals and strip floating point artifacts
 */
export function normalizeSvgNumbers(svg: string): string {
  // Replace numbers with excessive precision
  return svg
    .replace(/(\d+\.\d{4,})/g, (match) => {
      const num = parseFloat(match);
      if (isNaN(num)) return match;
      // Round to 3 decimals
      const rounded = Math.round(num * 1000) / 1000;
      return rounded.toString();
    })
    .replace(/\.0{4,}\d+/g, ""); // Remove artifacts like .000000000000001
}
