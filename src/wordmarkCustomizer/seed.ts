/**
 * Deterministic seeded PRNG for wordmark customization (same seed => same output).
 */

/**
 * Seeded RNG returning 0..1. Simple mulberry32.
 */
export function seededRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  let s = Math.abs(h) || 1;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0; // mulberry32
    const t = Math.imul(s ^ (s >>> 15), 1 | s);
    return ((t + (t ^ (t >>> 7)) >>> 0) / 4294967296);
  };
}

/**
 * Pick one element from array deterministically using rng.
 */
export function pick<T>(rng: () => number, arr: T[]): T {
  if (arr.length === 0) throw new Error("pick: empty array");
  const i = Math.floor(rng() * arr.length) % arr.length;
  return arr[i]!;
}
