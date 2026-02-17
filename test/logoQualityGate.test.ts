/**
 * Unit tests for logo quality gate
 */

import {
  scoreLogoCandidate,
  passesQualityGate,
  pickBest,
  normalizeSvgNumbers,
  type LogoCandidate,
} from "../src/evals/logoQualityGate";

describe("logoQualityGate", () => {
  describe("normalizeSvgNumbers", () => {
    it("should normalize floating point artifacts", () => {
      const svg = '<path d="M 10.600000000000001 20.999999999999998 L 30.0 40.0"/>';
      const normalized = normalizeSvgNumbers(svg);
      expect(normalized).not.toContain("000000000000001");
      expect(normalized).not.toContain("999999999999998");
    });

    it("should round to 3 decimals", () => {
      const svg = '<path d="M 10.123456789 20.987654321"/>';
      const normalized = normalizeSvgNumbers(svg);
      expect(normalized).toMatch(/10\.\d{1,3}/);
      expect(normalized).toMatch(/20\.\d{1,3}/);
    });
  });

  describe("scoreLogoCandidate - legibility", () => {
    it("should fail placeholder rectangle wordmark", () => {
      const placeholderWordmark = `<svg viewBox="0 0 100 50">
        <path d="M 10 10 L 90 10 L 90 40 L 10 40 Z"/>
      </svg>`;
      
      const candidate: LogoCandidate = {
        markSvg: `<svg viewBox="0 0 24 24"><path d="M 2 2 L 22 2 L 22 22 L 2 22 Z" fill="#000"/></svg>`,
        wordmarkSvg: placeholderWordmark,
        metadata: {
          wordmarkWeight: 400,
          wordmarkTracking: 0,
        },
      };

      const score = scoreLogoCandidate(candidate, []);
      expect(score.breakdown.legibility).toBeLessThan(7);
      expect(passesQualityGate(score)).toBe(false);
    });

    it("should pass real font wordmark with sufficient commands", () => {
      // Simulate a real wordmark with many path commands
      const realWordmark = `<svg viewBox="0 0 300 80">
        <path d="M 10 20 L 15 20 Q 20 15 25 20 L 30 20 L 30 60 L 10 60 Z M 40 20 L 45 20 C 50 15 55 15 60 20 L 65 20 L 65 60 L 40 60 Z"/>
        <path d="M 70 20 L 75 20 A 5 5 0 0 1 80 25 L 80 60 L 70 60 Z"/>
        <path d="M 90 20 L 95 20 Q 100 15 105 20 L 110 20 L 110 60 L 90 60 Z"/>
        <path d="M 120 20 L 125 20 C 130 15 135 15 140 20 L 145 20 L 145 60 L 120 60 Z"/>
        <path d="M 150 20 L 155 20 A 5 5 0 0 1 160 25 L 160 60 L 150 60 Z"/>
        <path d="M 170 20 L 175 20 Q 180 15 185 20 L 190 20 L 190 60 L 170 60 Z"/>
        <path d="M 200 20 L 205 20 C 210 15 215 15 220 20 L 225 20 L 225 60 L 200 60 Z"/>
        <path d="M 230 20 L 235 20 A 5 5 0 0 1 240 25 L 240 60 L 230 60 Z"/>
        <path d="M 250 20 L 255 20 Q 260 15 265 20 L 270 20 L 270 60 L 250 60 Z"/>
      </svg>`;
      
      const candidate: LogoCandidate = {
        markSvg: `<svg viewBox="0 0 24 24">
          <path d="M 2 2 L 12 2 L 12 12 L 2 12 Z" fill="#000" fill-rule="evenodd"/>
          <path d="M 12 12 L 22 12 L 22 22 L 12 22 Z" fill="#000" fill-rule="evenodd"/>
        </svg>`,
        wordmarkSvg: realWordmark,
        metadata: {
          wordmarkWeight: 700,
          wordmarkTracking: 0,
        },
      };

      const score = scoreLogoCandidate(candidate, []);
      expect(score.breakdown.legibility).toBeGreaterThanOrEqual(7);
    });
  });

  describe("scoreLogoCandidate - ownability", () => {
    it("should fail simple single-rect mark", () => {
      const simpleMark = `<svg viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" fill="#000"/>
      </svg>`;
      
      const candidate: LogoCandidate = {
        markSvg: simpleMark,
        wordmarkSvg: `<svg viewBox="0 0 200 50"><path d="M 10 10 L 190 10 L 190 40 L 10 40 Z M 20 20 L 180 20 L 180 30 L 20 30 Z"/></svg>`,
        metadata: {
          wordmarkWeight: 700,
          wordmarkTracking: 0,
        },
      };

      const score = scoreLogoCandidate(candidate, []);
      expect(score.breakdown.ownability).toBeLessThan(7);
      expect(passesQualityGate(score)).toBe(false);
    });

    it("should pass mark with multiple paths", () => {
      const complexMark = `<svg viewBox="0 0 24 24">
        <path d="M 2 2 L 12 2 L 12 12 L 2 12 Z" fill="#000" fill-rule="evenodd"/>
        <path d="M 12 12 L 22 12 L 22 22 L 12 22 Z" fill="#000" fill-rule="evenodd"/>
        <path d="M 6 6 L 18 6 L 18 18 L 6 18 Z" fill="#fff" fill-rule="evenodd"/>
      </svg>`;
      
      const candidate: LogoCandidate = {
        markSvg: complexMark,
        wordmarkSvg: `<svg viewBox="0 0 200 50"><path d="M 10 10 L 190 10 L 190 40 L 10 40 Z M 20 20 L 180 20 L 180 30 L 20 30 Z M 30 25 L 170 25 L 170 28 L 30 28 Z"/></svg>`,
        metadata: {
          wordmarkWeight: 700,
          wordmarkTracking: 0,
        },
      };

      const score = scoreLogoCandidate(candidate, []);
      expect(score.breakdown.ownability).toBeGreaterThanOrEqual(7);
    });
  });

  describe("pickBest", () => {
    it("should rank candidates by total score", () => {
      const candidates: Array<{ candidate: LogoCandidate; score: ReturnType<typeof scoreLogoCandidate> }> = [
        {
          candidate: {
            markSvg: `<svg viewBox="0 0 24 24"><path d="M 2 2 L 22 2 L 22 22 L 2 22 Z" fill="#000"/></svg>`,
            wordmarkSvg: `<svg viewBox="0 0 100 50"><path d="M 10 10 L 90 10 L 90 40 L 10 40 Z"/></svg>`,
            metadata: {},
          },
          score: { total: 5.0, breakdown: { legibility: 5, ownability: 5, boldness: 5, coherence: 5, craft: 5 }, failures: [] },
        },
        {
          candidate: {
            markSvg: `<svg viewBox="0 0 24 24"><path d="M 2 2 L 12 2 L 12 12 L 2 12 Z" fill="#000"/><path d="M 12 12 L 22 12 L 22 22 L 12 22 Z" fill="#000"/></svg>`,
            wordmarkSvg: `<svg viewBox="0 0 200 50"><path d="M 10 10 L 190 10 L 190 40 L 10 40 Z M 20 20 L 180 20 L 180 30 L 20 30 Z"/></svg>`,
            metadata: { wordmarkWeight: 700 },
          },
          score: { total: 8.5, breakdown: { legibility: 8, ownability: 9, boldness: 8, coherence: 8, craft: 9 }, failures: [] },
        },
      ];

      const { best, ranked } = pickBest(candidates);
      expect(best.score.total).toBe(8.5);
      expect(ranked[0]!.score.total).toBeGreaterThan(ranked[1]!.score.total);
    });
  });
});
