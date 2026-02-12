import {
  FinalizeRequestSchema,
  FinalKitSchema,
  type FinalKit,
  type FinalizeRequest,
} from "../schemas";
import { runExecutorAgent } from "../agents/executor.agent";

export async function finalize(request: FinalizeRequest): Promise<FinalKit> {
  // Validate request
  const safeRequest = FinalizeRequestSchema.parse(request);

  // Run Executor Agent to generate final kit
  console.log("🎯 Running Finalize Pipeline...");
  const finalKit = await runExecutorAgent(safeRequest);
  console.log("✅ Finalize pipeline completed");

  // Validate response
  return FinalKitSchema.parse(finalKit);
}
