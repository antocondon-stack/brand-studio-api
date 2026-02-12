import { Agent, run } from "@openai/agents";
import { z } from "zod";
import {
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
} from "../schemas";
import { buildDeterministicSvgs } from "../tools/deterministicSvg.tool";

// Schema for the executor output (palette, fonts, templates)
const ExecutorOutputSchema = z.object({
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

export const ExecutorAgent = new Agent({
  name: "ExecutorAgent",
  instructions: `You are a brand executor.
Goal: produce the final brand kit including color palette, typography, and templates based on the chosen creative direction.

Rules:
- Generate a cohesive color palette (5-7 colors) based on the creative direction's color keywords
- Recommend typography that matches the typography keywords
- Suggest practical templates for brand application
- Be specific and actionable
- You MUST respond with JSON ONLY (no markdown, no prose).
- Your JSON MUST strictly conform to the ExecutorOutput schema.

Return ONLY valid JSON with EXACT keys:
{
  "palette": [
    {"role": "primary", "hex": "#..."},
    {"role": "secondary", "hex": "#..."},
    {"role": "accent", "hex": "#..."},
    {"role": "neutral", "hex": "#..."},
    {"role": "background", "hex": "#..."}
  ],
  "fonts": [
    {"role": "heading", "family": "...", "weight": "...", "usage": "..."},
    {"role": "body", "family": "...", "weight": "...", "usage": "..."}
  ],
  "templates": [
    {"id": "...", "name": "...", "description": "...", "format": "..."}
  ]
}

Constraints:
- palette: 5-7 colors with roles (primary, secondary, accent, neutral, background, etc.)
- fonts: 2-4 font recommendations with roles (heading, body, display, etc.)
- templates: 3-6 template suggestions for brand application`,
  model: "gpt-4.1",
  outputType: ExecutorOutputSchema,
});

export async function runExecutorAgent(request: FinalizeRequest): Promise<FinalKit> {
  const { intake, chosen_direction } = request;

  // Step 1: Generate logos using deterministic SVG function
  console.log("🎨 Generating logos...");
  
  // Generate a simple palette from keywords (simplified approach)
  // In production, you might want to use an AI service to generate actual colors from keywords
  // Note: The schema expects 6-digit hex codes like #123456 (7 chars total with #)
  const defaultPalette = [
    "#1a1a1a", // dark
    "#ffffff", // light
    "#3b82f6", // blue
    "#10b981", // green
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // purple
  ];

  // Generate logos using the deterministic SVG function
  const logos = buildDeterministicSvgs({
    brand_name: intake.brand_name,
    direction_name: chosen_direction.name,
    logo_archetype: chosen_direction.logo_archetype,
    keywords: chosen_direction.color_keywords,
    palette_hex: defaultPalette,
    vibe: chosen_direction.one_liner,
  });

  // Step 2: Run Executor Agent to get palette, fonts, and templates
  console.log("📦 Running Executor Agent...");
  
  const result = await run(
    ExecutorAgent,
    [
      {
        role: "user",
        content: [
          "You are given a chosen creative direction.",
          "Generate a complete brand kit: color palette, typography, and templates.",
          "",
          "Chosen Direction JSON:",
          JSON.stringify(chosen_direction, null, 2),
        ].join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("ExecutorAgent did not produce a final output");
  }

  const executorOutput = ExecutorOutputSchema.parse(output);

  // Combine logos with executor output
  const finalKit: FinalKit = {
    logo_svg_wordmark: logos.logo_svg_wordmark,
    logo_svg_mark: logos.logo_svg_mark,
    palette: executorOutput.palette,
    fonts: executorOutput.fonts,
    templates: executorOutput.templates,
  };

  return FinalKitSchema.parse(finalKit);
}
