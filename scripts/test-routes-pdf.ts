import dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const API_URL = process.env.API_URL || "http://localhost:8787";

async function testRoutesPdf() {
  console.log("🧪 Testing POST /routes-pdf\n");

  const testRequest = {
    intake: {
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
    },
    market_summary: {
      competitors: [
        {
          name: "SolarCity",
          positioning: "Residential solar installation",
          visual_style: "Clean, modern, tech-forward",
        },
      ],
      visual_patterns: ["Blue and green color schemes", "Solar iconography"],
      positioning_patterns: ["Eco-friendly", "Cost savings"],
      cliches_to_avoid: ["Generic leaf logos", "Overused green"],
      whitespace_opportunities: ["Bold typography", "Minimalist approach"],
    },
    brand_strategy: {
      brand_essence: "Empowering sustainable energy independence",
      value_props: ["Smart energy management", "Cost-effective solutions"],
      proof_points: ["10+ years experience", "50,000+ installations"],
      personality: ["Innovative", "Trustworthy", "Eco-conscious"],
      positioning_statement: "The smart choice for sustainable energy",
      messaging_pillars: [
        { id: "1", label: "Innovation", description: "Cutting-edge technology" },
        { id: "2", label: "Sustainability", description: "Environmental responsibility" },
        { id: "3", label: "Value", description: "Cost-effective solutions" },
      ],
    },
    creative_directions: [
      {
        id: "A",
        name: "Modern Minimal",
        rationale: "Clean, tech-forward approach",
        keywords: ["minimal", "tech", "clean", "modern"],
        logo_archetype: "wordmark",
        typography_axis: "neo-grotesk",
        color_logic: "tech_clean",
        design_rules: ["Use ample white space", "Keep it simple"],
        visual_thesis: "Minimalist design that emphasizes clarity",
        motif_system: {
          motifs: ["loop"],
          geometry_notes: ["Simple curves"],
          avoid: ["Complex shapes"],
        },
        wordmark_style: {
          case: "lowercase",
          contrast: "low",
          terminal: "round",
          tracking: "normal",
        },
        logo_requirements: {
          silhouette: "simple",
          stroke: "mono_stroke",
          min_detail: "low",
          distinctiveness_hook: "Clean geometric mark",
        },
      },
      {
        id: "B",
        name: "Eco Bold",
        rationale: "Bold, nature-inspired",
        keywords: ["bold", "nature", "organic", "strong"],
        logo_archetype: "combination",
        typography_axis: "humanist",
        color_logic: "earthy",
        design_rules: ["Use organic shapes", "Bold typography"],
        visual_thesis: "Bold design inspired by nature",
        motif_system: {
          motifs: ["interlock"],
          geometry_notes: ["Organic interlocking"],
          avoid: ["Literal leaves"],
        },
        wordmark_style: {
          case: "uppercase",
          contrast: "high",
          terminal: "sharp",
          tracking: "tight",
        },
        logo_requirements: {
          silhouette: "medium",
          stroke: "mono_stroke",
          min_detail: "med",
          distinctiveness_hook: "Interlocking organic shapes",
        },
      },
      {
        id: "C",
        name: "Tech Premium",
        rationale: "Premium tech aesthetic",
        keywords: ["premium", "tech", "sleek", "professional"],
        logo_archetype: "monogram",
        typography_axis: "geometric",
        color_logic: "neutral_premium",
        design_rules: ["Premium feel", "Tech-forward"],
        visual_thesis: "Premium technology brand",
        motif_system: {
          motifs: ["orbit"],
          geometry_notes: ["Circular motion"],
          avoid: ["Overly complex"],
        },
        wordmark_style: {
          case: "titlecase",
          contrast: "med",
          terminal: "mixed",
          tracking: "wide",
        },
        logo_requirements: {
          silhouette: "simple",
          stroke: "mono_stroke",
          min_detail: "low",
          distinctiveness_hook: "Orbital motion mark",
        },
      },
    ],
    recommended_direction_id: "A",
  };

  try {
    console.log("📤 Sending request to", `${API_URL}/routes-pdf`);
    const response = await fetch(`${API_URL}/routes-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testRequest),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    const result = await response.json();
    console.log("✅ Routes PDF generated successfully!");
    console.log("📄 Routes PDF URL:", result.routes_pdf_url);
    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
    }
    process.exit(1);
  }
}

testRoutesPdf();
