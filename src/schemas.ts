import { z } from "zod";

// Intake from the client
export const IntakeSchema = z.object({
  brand_name: z.string().min(1),
  sector: z.string().min(1),
  audience: z.object({
    primary: z.string().min(1),
    secondary: z.string().optional(),
  }),
  tone: z.string().min(1),
  ambition_level: z.enum(["low", "mid", "high"]),
  constraints: z.string().optional(),
  keywords: z.array(z.string().min(1)).optional(),
});

export type Intake = z.infer<typeof IntakeSchema>;

// Market summary produced by ResearchAgent
export const MarketSummarySchema = z.object({
  competitors: z
    .array(
      z.object({
        name: z.string().min(1),
        positioning: z.string().min(1),
        visual_style: z.string().min(1),
        url: z.string().url().optional(),
      }),
    )
    .min(1),
  visual_patterns: z.array(z.string().min(1)),
  positioning_patterns: z.array(z.string().min(1)),
  cliches_to_avoid: z.array(z.string().min(1)),
  whitespace_opportunities: z.array(z.string().min(1)),
});

export type MarketSummary = z.infer<typeof MarketSummarySchema>;

// Brand strategy produced by StrategyAgent
export const BrandStrategySchema = z.object({
  brand_essence: z.string().min(1),
  value_props: z.array(z.string().min(1)).min(1),
  proof_points: z.array(z.string().min(1)).min(1),
  personality: z.array(z.string().min(1)).min(1),
  positioning_statement: z.string().min(1),
  messaging_pillars: z
    .array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(3),
  do_nots: z.array(z.string().min(1)).optional(),
});

export type BrandStrategy = z.infer<typeof BrandStrategySchema>;

// Creative directions (A/B/C) produced by CreativeDirectorAgent
export const CreativeDirectionSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  name: z.string().min(1),
  one_liner: z.string().min(1),
  narrative: z.string().min(1),
  logo_archetype: z.enum([
    "wordmark",
    "monogram",
    "symbol",
    "combination",
    "emblem",
  ]),
  color_keywords: z.array(z.string().min(1)),
  typography_keywords: z.array(z.string().min(1)),
  imagery_style: z.string().min(1),
  motion_style: z.string().optional(),
  use_cases: z.array(z.string().min(1)),
  risks: z.array(z.string().min(1)).optional(),
  mitigations: z.array(z.string().min(1)).optional(),
});

export type CreativeDirection = z.infer<typeof CreativeDirectionSchema>;

export const CreativeDirectionsSchema = z
  .array(CreativeDirectionSchema)
  .length(3);

// Concept artist: single concept metadata + optional base64 preview
export const LogoConceptSchema = z.object({
  id: z.number(),
  motif_family: z.enum(["loop", "interlock", "orbit", "fold", "swap"]),
  composition: z.string().min(1),
  description: z.string().optional(),
  preview_base64: z.string().optional(),
});

export type LogoConcept = z.infer<typeof LogoConceptSchema>;

// Final kit produced by ExecutorAgent (endpoint-compatible: existing fields required, new optional)
export const FinalKitSchema = z.object({
  logo_svg_wordmark: z.string().min(1),
  logo_svg_mark: z.string().min(1),
  selected_concept_preview: z.string().optional(),
  selected_concept_metadata: z
    .object({
      motif_family: z.string(),
      composition: z.string(),
    })
    .optional(),
  palette: z
    .array(
      z.object({
        role: z.string().min(1),
        hex: z
          .string()
          .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, "Expected a hex color"),
      }),
    )
    .min(5)
    .max(7),
  fonts: z.array(
    z.object({
      role: z.string().min(1),
      family: z.string().min(1),
      weight: z.string().min(1),
      usage: z.string().min(1),
    }),
  ),
  templates: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().min(1),
      format: z.string().min(1),
    }),
  ),
});

export type FinalKit = z.infer<typeof FinalKitSchema>;

// Composite shapes for pipeline I/O
export const GenerateResponseSchema = z.object({
  market_summary: MarketSummarySchema,
  brand_strategy: BrandStrategySchema,
  creative_directions: CreativeDirectionsSchema,
  recommended_direction_id: z.enum(["A", "B", "C"]),
});

export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;

export const FinalizeRequestSchema = z.object({
  intake: IntakeSchema,
  market_summary: MarketSummarySchema,
  brand_strategy: BrandStrategySchema,
  chosen_direction: CreativeDirectionSchema,
});

export type FinalizeRequest = z.infer<typeof FinalizeRequestSchema>;

// Logo critic output (LogoCriticAgent)
export const LogoCriticScoresSchema = z.object({
  on_brief: z.number().min(0).max(100),
  distinctiveness: z.number().min(0).max(100),
  craft: z.number().min(0).max(100),
  scalability: z.number().min(0).max(100),
  cliche_risk: z.number().min(0).max(100),
  ai_look_risk: z.number().min(0).max(100),
});

export const LogoCriticOutputSchema = z.object({
  scores: LogoCriticScoresSchema,
  issues: z.array(z.string().min(1)),
  actions: z.array(z.string().min(1)),
  pass: z.boolean(),
});

export type LogoCriticOutput = z.infer<typeof LogoCriticOutputSchema>;

