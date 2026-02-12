import * as crypto from "crypto";
import {
  FinalizeRequestSchema,
  FinalKitSchema,
  FinalizeResponseSchema,
  type FinalKit,
  type FinalizeRequest,
  type FinalizeResponse,
  type LogoConcept,
} from "../schemas";
import { runExecutorAgent } from "../agents/executor.agent";
import { runLogoCriticAgent, runLogoCriticAgentForConcept, conceptScoreFromCritic } from "../agents/logoCritic.agent";
import { runConceptArtistAgent } from "../agents/conceptArtist.agent";
import { buildGuidelinesPdf } from "../pdf/guidelines";
import { storeGuidelinesPdf } from "../pdf/store";

const MAX_ITERATIONS = 2;

function generateRunSeed(): string {
  return crypto.randomUUID();
}

export async function finalize(request: FinalizeRequest): Promise<FinalizeResponse> {
  const safeRequest = FinalizeRequestSchema.parse(request);
  const { intake, chosen_direction, regen, regen_seed: requestedRegenSeed } = safeRequest;

  const runSeed = requestedRegenSeed ?? generateRunSeed();
  if (regen) {
    console.log("🔄 Regeneration: re-running execution only (regen=true)", {
      regen_seed: runSeed,
      brand_name: intake.brand_name,
    });
  }
  console.log("regen_seed:", runSeed, "(reproducible output per customer)");

  let selectedConcept: LogoConcept | null = null;

  if (!regen) {
    console.log("🎯 Running Finalize Pipeline...");
    // 1) Generate concepts (skip when regen=true)
    console.log("🎨 Step 1: Generating concepts...");
    let concepts: LogoConcept[];
    try {
      concepts = await runConceptArtistAgent(
        intake.brand_name,
        chosen_direction.name,
        `${chosen_direction.visual_thesis} ${chosen_direction.rationale}`,
      );
    } catch (e) {
      console.warn("Concept generation failed, continuing without concepts:", e);
      concepts = [];
    }

    // 2) Score concepts; 3) Select top concept
    if (concepts.length > 0) {
      console.log("🔍 Step 2: Scoring concepts...");
      const scores = await Promise.all(
        concepts.map((c) =>
          runLogoCriticAgentForConcept(c, intake.brand_name, chosen_direction.name).then((out) => ({
            concept: c,
            score: conceptScoreFromCritic(out),
          })),
        ),
      );
      if (scores.length > 0) {
        const top = scores.reduce((best, s) => (s.score > best.score ? s : best), scores[0]!);
        selectedConcept = top.concept;
        console.log(`✅ Step 3: Selected concept id=${selectedConcept.id} (motif=${selectedConcept.motif_family}, composition=${selectedConcept.composition})`);
      }
    }
  } else {
    console.log("🎯 Regeneration: skipping concept generation and selection");
  }

  let finalKit: FinalKit;
  let criticResult: { pass: boolean; actions: string[] } | null = null;
  let iteration = 0;

  while (iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`📐 Vector + critic iteration ${iteration}/${MAX_ITERATIONS}`);

    finalKit = await runExecutorAgent(
      safeRequest,
      criticResult?.pass === false ? criticResult.actions : undefined,
      selectedConcept ?? undefined,
      runSeed,
    );

    console.log("🔍 Running final Logo Critic...");
    const criticOutput = await runLogoCriticAgent({
      logo_svg_wordmark: finalKit.logo_svg_wordmark,
      logo_svg_mark: finalKit.logo_svg_mark,
      palette: finalKit.palette,
      chosen_direction_name: chosen_direction.name,
      brand_name: intake.brand_name,
    });

    console.log(
      `   Critic: pass=${criticOutput.pass} scores=${JSON.stringify(criticOutput.scores)}`,
    );

    if (criticOutput.pass) {
      console.log("✅ Finalize pipeline completed (critic passed)");
      let guidelines_pdf_id: string | undefined;
      try {
        const pdfBuffer = await buildGuidelinesPdf(
          finalKit,
          safeRequest.intake,
          safeRequest.brand_strategy,
          safeRequest.chosen_direction,
        );
        guidelines_pdf_id = storeGuidelinesPdf(pdfBuffer);
      } catch (e) {
        console.warn("Guidelines PDF generation failed:", e);
      }
      const response: FinalizeResponse = {
        final_kit: FinalKitSchema.parse(finalKit),
        regen_seed: runSeed,
        guidelines_pdf_id,
      };
      return FinalizeResponseSchema.parse(response);
    }

    criticResult = { pass: criticOutput.pass, actions: criticOutput.actions };

    if (iteration >= MAX_ITERATIONS) {
      console.log("⚠️ Max iterations reached; returning last kit");
      break;
    }

    console.log("🔄 Critic failed; applying actions and regenerating...");
  }

  console.log("✅ Finalize pipeline completed");
  let guidelines_pdf_id: string | undefined;
  try {
    const pdfBuffer = await buildGuidelinesPdf(
      finalKit!,
      safeRequest.intake,
      safeRequest.brand_strategy,
      safeRequest.chosen_direction,
    );
    guidelines_pdf_id = storeGuidelinesPdf(pdfBuffer);
  } catch (e) {
    console.warn("Guidelines PDF generation failed:", e);
  }
  const response: FinalizeResponse = {
    final_kit: FinalKitSchema.parse(finalKit!),
    regen_seed: runSeed,
    guidelines_pdf_id,
  };
  return FinalizeResponseSchema.parse(response);
}
