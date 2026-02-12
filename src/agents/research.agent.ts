import { Agent, run, webSearchTool } from "@openai/agents";
import { IntakeSchema, MarketSummarySchema, type Intake, type MarketSummary } from "../schemas";

export const ResearchAgent = new Agent({
  name: "ResearchAgent",
  instructions: `You are a brand research analyst.
Goal: produce a grounded market + competitor + visual-trend snapshot for the brand.

Rules:
- Use web search when needed to identify competitors and category leaders.
- Summarize BOTH visual patterns and positioning patterns.
- Be specific to the brand’s industry and audience.
- Avoid generic advice.
- You MUST respond with JSON ONLY (no markdown, no prose).
- Your JSON MUST strictly conform to the MarketSummary schema.

Return ONLY valid JSON with EXACT keys:
{
  "competitors":[
    {
      "name":"",
      "positioning":"",
      "visual_style":"",
      "url":""
    }
  ],
  "visual_patterns":["..."],
  "positioning_patterns":["..."],
  "cliches_to_avoid":["..."],
  "whitespace_opportunities":["..."]
}

Constraints:
- competitors: 6–10 entries, each with name (required), positioning (required), visual_style (required), url (optional - ONLY include if you have a valid, complete URL starting with http:// or https://. If unknown or invalid, DO NOT include the url field at all - omit it completely)
- visual_patterns: 6–10 concrete visual language bullets (type, color, layout, iconography)
- positioning_patterns: 6–10 concrete messaging angles (promise, proof, tone)
- cliches_to_avoid: 5–8 bullets specific to this category
- whitespace_opportunities: 5–8 actionable, specific opportunities`,
  tools: [webSearchTool()],
  model: "gpt-4.1",
  outputType: MarketSummarySchema,
});

// Helper function to clean competitor URLs - remove invalid URLs and empty strings
function cleanCompetitorUrls(rawOutput: any): any {
  if (!rawOutput || !rawOutput.competitors || !Array.isArray(rawOutput.competitors)) {
    return rawOutput;
  }

  const cleanedCompetitors = rawOutput.competitors.map((competitor: any) => {
    const cleaned = { ...competitor };
    
    // Remove url field if it's empty, invalid, or not a valid URL
    if (cleaned.url !== undefined) {
      const urlStr = String(cleaned.url).trim();
      
      // Remove if empty string
      if (urlStr === "" || urlStr === "null" || urlStr === "undefined") {
        delete cleaned.url;
      } else {
        // Try to validate URL - if invalid, remove it
        try {
          new URL(urlStr);
          // If URL is valid, keep it
          cleaned.url = urlStr;
        } catch {
          // Invalid URL, remove it
          delete cleaned.url;
        }
      }
    }
    
    return cleaned;
  });

  return {
    ...rawOutput,
    competitors: cleanedCompetitors,
  };
}

export async function runResearchAgent(intake: Intake): Promise<MarketSummary> {
  const safeIntake = IntakeSchema.parse(intake);

  const result = await run(
    ResearchAgent,
    [
      {
        role: "user",
        content: [
          "You are given structured intake data for a brand.",
          "Use web search to analyze the market and return a MarketSummary JSON object.",
          "",
          "Intake JSON:",
          JSON.stringify(safeIntake, null, 2),
        ].join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("ResearchAgent did not produce a final output");
  }

  // Clean invalid URLs before validation
  const cleanedOutput = cleanCompetitorUrls(output);
  
  return MarketSummarySchema.parse(cleanedOutput);
}


