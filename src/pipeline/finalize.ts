import {
  FinalizeRequestSchema,
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
  type LogoConcept,
} from "../schemas";
import { runExecutorAgent } from "../agents/executor.agent";
import { runLogoCriticAgent, runLogoCriticAgentForConcept, conceptScoreFromCritic } from "../agents/logoCritic.agent";
import { runConceptArtistAgent } from "../agents/conceptArtist.agent";

const MAX_ITERATIONS = 2;

export async function finalize(request: FinalizeRequest): Promise<FinalKit> {
  const safeRequest = FinalizeRequestSchema.parse(request);
  const { intake, chosen_direction } = safeRequest;

  console.log("🎯 Running Finalize Pipeline...");

  // 1) Generate concepts (6 visually distinct logo concept renders)
  console.log("🎨 Step 1: Generating concepts...");
  let concepts: LogoConcept[];
  try {
    concepts = await runConceptArtistAgent(
      intake.brand_name,
      chosen_direction.name,
      `${chosen_direction.one_liner} ${chosen_direction.narrative}`,
    );
  } catch (e) {
    console.warn("Concept generation failed, continuing without concepts:", e);
    concepts = [];
  }

  // 2) Run LogoCriticAgent to score concept ideas; 3) Select top concept
  let selectedConcept: LogoConcept | null = null;
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

  // 4) Pass selected concept into vector engine; 5) run final critic; support retry
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
    );

    // 5) Run final LogoCriticAgent review
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
      return FinalKitSchema.parse(finalKit);
    }

    criticResult = { pass: criticOutput.pass, actions: criticOutput.actions };

    if (iteration >= MAX_ITERATIONS) {
      console.log("⚠️ Max iterations reached; returning last kit");
      break;
    }

    console.log("🔄 Critic failed; applying actions and regenerating...");
  }

  console.log("✅ Finalize pipeline completed");
  return FinalKitSchema.parse(finalKit!);
}
