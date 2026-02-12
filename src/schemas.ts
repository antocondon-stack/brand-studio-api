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

// Creative directions (A/B/C) — world-class CD spec (motifMark families, executable)
const WordmarkCaseSchema = z.enum(["lowercase", "uppercase", "titlecase"]);
const ContrastSchema = z.enum(["low", "med", "high"]);
const TerminalSchema = z.enum(["round", "sharp", "mixed"]);
const TrackingSchema = z.enum(["tight", "normal", "wide"]);
const SilhouetteSchema = z.enum(["simple", "medium", "complex"]);
const StrokeSchema = z.enum(["none", "mono_stroke"]);
const MinDetailSchema = z.enum(["low", "med"]);

export const CreativeDirectionSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  name: z.string().min(1),
  rationale: z.string().min(1),
  keywords: z.array(z.string().min(1)),
  logo_archetype: z.enum(["wordmark", "monogram", "emblem", "combination"]),
  typography_axis: z.enum([
    "geometric",
    "humanist",
    "editorial",
    "grotesk",
    "neo-grotesk",
  ]),
  color_logic: z.enum([
    "mono_accent",
    "neutral_premium",
    "vibrant",
    "earthy",
    "tech_clean",
  ]),
  design_rules: z.array(z.string().min(1)),
  visual_thesis: z.string().min(1),
  motif_system: z.object({
    motifs: z.array(z.string().min(1)),
    geometry_notes: z.array(z.string().min(1)),
    avoid: z.array(z.string().min(1)),
  }),
  wordmark_style: z.object({
    case: WordmarkCaseSchema,
    contrast: ContrastSchema,
    terminal: TerminalSchema,
    tracking: TrackingSchema,
  }),
  logo_requirements: z.object({
    silhouette: SilhouetteSchema,
    stroke: StrokeSchema,
    min_detail: MinDetailSchema,
    distinctiveness_hook: z.string().min(1),
  }),
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
  templates: z.object({
    social_post: z.object({
      layout: z.string().min(1),
      copy_slots: z.object({
        headline: z.string(),
        subhead: z.string(),
        cta: z.string(),
      }),
      preview_svg: z.string().min(1),
    }),
    website_hero: z.object({
      layout: z.string().min(1),
      copy_slots: z.object({
        headline: z.string(),
        subhead: z.string(),
        cta: z.string(),
      }),
      preview_svg: z.string().min(1),
    }),
  }),
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
  regen: z.boolean().optional(),
  regen_seed: z.string().optional(),
});

export type FinalizeRequest = z.infer<typeof FinalizeRequestSchema>;

/** POST /finalize response: final_kit + chosen_direction + regen_seed; optional guidelines PDF */
export const FinalizeResponseSchema = z.object({
  final_kit: FinalKitSchema,
  chosen_direction: CreativeDirectionSchema,
  color_tags: z.array(z.string()),
  typography_tags: z.array(z.string()),
  regen_seed: z.string().min(1),
  guidelines_pdf_url: z.string().optional(),
  guidelines_pdf_id: z.string().optional(),
  guidelines_pdf_base64: z.string().optional(),
});

export type FinalizeResponse = z.infer<typeof FinalizeResponseSchema>;

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

