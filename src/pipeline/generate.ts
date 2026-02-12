import { IntakeSchema, GenerateResponseSchema, type GenerateResponse, type Intake } from "../schemas";
import { runResearchAgent } from "../agents/research.agent";
import { runStrategyAgent } from "../agents/strategy.agent";
import { runCreativeDirectorAgent } from "../agents/creativeDirector.agent";

export async function generate(intake: Intake): Promise<GenerateResponse> {
  // Validate intake
  const safeIntake = IntakeSchema.parse(intake);

  // Step 1: Run Research Agent
  console.log("🔍 Running Research Agent...");
  const marketSummary = await runResearchAgent(safeIntake);
  console.log("✅ Research Agent completed");

  // Step 2: Run Strategy Agent
  console.log("📊 Running Strategy Agent...");
  const brandStrategy = await runStrategyAgent(safeIntake, marketSummary);
  console.log("✅ Strategy Agent completed");

  // Step 3: Run Creative Director Agent
  console.log("🎨 Running Creative Director Agent...");
  const creativeDirections = await runCreativeDirectorAgent(
    safeIntake,
    marketSummary,
    brandStrategy,
  );
  console.log("✅ Creative Director Agent completed");

  // Step 4: Determine recommended direction (simple heuristic: first one for now)
  // In a real implementation, this could be more sophisticated
  const recommendedDirectionId = creativeDirections[0]?.id || "A";

  // Construct response
  const response: GenerateResponse = {
    market_summary: marketSummary,
    brand_strategy: brandStrategy,
    creative_directions: creativeDirections,
    recommended_direction_id: recommendedDirectionId,
  };

  // Validate response
  return GenerateResponseSchema.parse(response);
}
