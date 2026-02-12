import dotenv from "dotenv";
import { runResearchAgent } from "./src/agents/research.agent";
import { IntakeSchema, type Intake } from "./src/schemas";

// Load environment variables
dotenv.config();

// Test data
const testIntake: Intake = {
  brand_name: "EcoFlow",
  sector: "Sustainable Energy Solutions",
  audience: {
    primary: "Environmentally conscious homeowners",
    secondary: "Small business owners",
  },
  tone: "Innovative and trustworthy",
  ambition_level: "high",
  constraints: "Must appeal to both residential and commercial markets",
  keywords: ["sustainability", "renewable", "smart", "efficient"],
};

async function testGenerate() {
  console.log("🧪 Testing Generate Pipeline...\n");
  console.log("Test Intake:", JSON.stringify(testIntake, null, 2));
  console.log("\n");

  try {
    // Validate intake
    console.log("✅ Validating intake...");
    const validatedIntake = IntakeSchema.parse(testIntake);
    console.log("✅ Intake validated successfully\n");

    // Test Research Agent
    console.log("🔍 Running Research Agent...");
    const marketSummary = await runResearchAgent(validatedIntake);
    console.log("✅ Research Agent completed");
    console.log("Market Summary:", JSON.stringify(marketSummary, null, 2));
    console.log("\n");

    console.log("✅ Generate test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run the test
testGenerate();
