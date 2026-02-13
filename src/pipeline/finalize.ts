import * as crypto from "crypto";
import {
  FinalizeRequestSchema,
  FinalKitSchema,
  FinalizeResponseSchema,
  type CreativeDirection,
  type FinalKit,
  type FinalizeRequest,
  type FinalizeResponse,
  type LogoConcept,
} from "../schemas";
import { runExecutorAgent } from "../agents/executor.agent";
import { runLogoCriticAgent, runLogoCriticAgentForConcept, conceptScoreFromCritic } from "../agents/logoCritic.agent";
import { runConceptArtistAgent } from "../agents/conceptArtist.agent";
import { runCDConstraintCompiler } from "../agents/cdConstraintCompiler.agent";
import { runComparativeConceptCritic } from "../agents/comparativeConceptCritic.agent";
import { buildGuidelinesPdf } from "../pdf/guidelines";
import { storeGuidelinesPdf } from "../pdf/store";
import type { CDConstraints, ComparativeCritique } from "../schemas";

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
  let cdConstraints: CDConstraints | null = null;
  let executionDirectives: ComparativeCritique["execution_directives"] | null = null;

  // Step 0: Always run CD Constraint Compiler (unless regen=true, reuse constraints if available)
  if (!regen) {
    console.log("🎯 Running Finalize Pipeline...");
    console.log("📋 Step 0: Compiling CD constraints...");
    try {
      cdConstraints = await runCDConstraintCompiler(intake.brand_name, safeRequest.brand_strategy, chosen_direction);
      console.log(`✅ CD Constraints compiled: ${cdConstraints.motif_family_priority.length} motif priorities, ${cdConstraints.distinctiveness_hook_checks.length} hook checks`);
    } catch (e) {
      console.warn("CD Constraint Compiler failed, continuing without constraints:", e);
    }
  } else {
    console.log("🎯 Regeneration: skipping constraint compilation (reuse from previous run if available)");
  }

  if (!regen) {
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

    // 2) Comparative concept critique (replaces simple scoring)
    if (concepts.length > 0 && cdConstraints) {
      console.log("🔍 Step 2: Comparative concept critique...");
      try {
        const comparativeCritique = await runComparativeConceptCritic(
          intake.brand_name,
          chosen_direction,
          cdConstraints,
          concepts,
        );
        const selectedConceptId = comparativeCritique.selected_concept_id;
        selectedConcept = concepts.find((c) => c.id === selectedConceptId) ?? concepts[0] ?? null;
        executionDirectives = comparativeCritique.execution_directives;
        console.log(`✅ Step 3: Selected concept id=${selectedConceptId} via comparative critique`);
        console.log(`   Execution directives: motif=${executionDirectives.motif_family}, variants=${executionDirectives.variant_targets.join(",")}, adjustments=${executionDirectives.geometry_adjustments.length}`);
      } catch (e) {
        console.warn("Comparative concept critique failed, falling back to simple scoring:", e);
        // Fallback to simple scoring
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
          console.log(`✅ Step 3: Selected concept id=${selectedConcept.id} (fallback scoring)`);
        }
      }
    } else if (concepts.length > 0) {
      // Fallback: simple scoring if no constraints
      console.log("🔍 Step 2: Scoring concepts (no constraints available)...");
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
        console.log(`✅ Step 3: Selected concept id=${selectedConcept.id} (simple scoring)`);
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
      cdConstraints ?? undefined,
      executionDirectives ?? undefined,
    );

    console.log("🔍 Running final Logo Critic (strategic alignment audit)...");
    const criticInput: Parameters<typeof runLogoCriticAgent>[0] = {
      logo_svg_wordmark: finalKit.logo_svg_wordmark,
      logo_svg_mark: finalKit.logo_svg_mark,
      palette: finalKit.palette,
      chosen_direction_name: chosen_direction.name,
      brand_name: intake.brand_name,
    };
    if (cdConstraints) {
      criticInput.cd_constraints = cdConstraints;
    }
    const criticOutput = await runLogoCriticAgent(criticInput);

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
      const response = buildFinalizeResponse(finalKit, chosen_direction, runSeed, guidelines_pdf_id);
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
  const response = buildFinalizeResponse(finalKit!, chosen_direction, runSeed, guidelines_pdf_id);
  return FinalizeResponseSchema.parse(response);
}

function buildFinalizeResponse(
  finalKit: FinalKit,
  chosen_direction: CreativeDirection,
  runSeed: string,
  guidelines_pdf_id: string | undefined,
): FinalizeResponse {
  const color_tags = [
    chosen_direction.color_logic,
    ...chosen_direction.keywords,
  ].filter(Boolean);
  const typography_tags = [
    chosen_direction.typography_axis,
    chosen_direction.wordmark_style.case,
    chosen_direction.wordmark_style.contrast,
    chosen_direction.wordmark_style.terminal,
    chosen_direction.wordmark_style.tracking,
  ].filter(Boolean);
  return {
    final_kit: FinalKitSchema.parse(finalKit),
    chosen_direction,
    color_tags,
    typography_tags,
    regen_seed: runSeed,
    guidelines_pdf_id,
  };
}
