import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:8787";

async function testFinalize() {
  console.log("🧪 Testing POST /generate then POST /finalize\n");

  const intake = {
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

  try {
    console.log("📤 Step 1: POST /generate");
    const generateResponse = await fetch(`${API_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(intake),
    });

    if (!generateResponse.ok) {
      const error = await generateResponse.text();
      throw new Error(`Generate failed: HTTP ${generateResponse.status}: ${error}`);
    }

    const generateResult = await generateResponse.json();
    console.log("✅ Generate completed");
    console.log("   Recommended direction:", generateResult.recommended_direction_id);
    console.log("   Creative directions:", generateResult.creative_directions.length);

    const chosenDirection = generateResult.creative_directions.find(
      (d: { id: string }) => d.id === generateResult.recommended_direction_id,
    );

    if (!chosenDirection) {
      throw new Error("Chosen direction not found");
    }

    console.log("\n📤 Step 2: POST /finalize");
    const finalizeRequest = {
      intake,
      market_summary: generateResult.market_summary,
      brand_strategy: generateResult.brand_strategy,
      chosen_direction: chosenDirection,
    };

    const finalizeResponse = await fetch(`${API_URL}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(finalizeRequest),
    });

    if (!finalizeResponse.ok) {
      const error = await finalizeResponse.text();
      throw new Error(`Finalize failed: HTTP ${finalizeResponse.status}: ${error}`);
    }

    const finalizeResult = await finalizeResponse.json();
    console.log("✅ Finalize completed");
    console.log("   Regeneration seed:", finalizeResult.regen_seed);
    if (finalizeResult.guidelines_pdf_url) {
      console.log("   Guidelines PDF URL:", finalizeResult.guidelines_pdf_url);
    }
    console.log("   Final kit includes:");
    console.log("     - Logo wordmark:", finalizeResult.final_kit.logo_svg_wordmark.substring(0, 50) + "...");
    console.log("     - Logo mark:", finalizeResult.final_kit.logo_svg_mark.substring(0, 50) + "...");
    console.log("     - Palette colors:", finalizeResult.final_kit.palette.length);
    console.log("     - Fonts:", finalizeResult.final_kit.fonts.length);
    console.log("     - Templates:", Object.keys(finalizeResult.final_kit.templates).length);

    const outputPath = path.join(process.cwd(), "test-finalize-output.json");
    fs.writeFileSync(outputPath, JSON.stringify(finalizeResult, null, 2));
    console.log(`\n💾 Full response saved to: ${outputPath}`);

    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      if (error.stack) console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

testFinalize();
