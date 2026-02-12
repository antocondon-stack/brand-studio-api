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
  // Note: outputType removed - we validate after cleaning URLs
});

// Helper function to clean competitor URLs - remove invalid URLs and empty strings
function cleanCompetitorUrls(rawOutput: any): any {
  if (!rawOutput || !rawOutput.competitors || !Array.isArray(rawOutput.competitors)) {
    return rawOutput;
  }

  const cleanedCompetitors = rawOutput.competitors.map((competitor: any) => {
    const cleaned: any = {
      name: competitor.name,
      positioning: competitor.positioning,
      visual_style: competitor.visual_style,
    };
    
    // Only add url if it exists and is valid
    if (competitor.url !== undefined && competitor.url !== null) {
      const urlStr = String(competitor.url).trim();
      
      // Skip if empty, null, undefined, or invalid
      if (urlStr && urlStr !== "" && urlStr !== "null" && urlStr !== "undefined") {
        // Try to validate URL - only add if valid
        try {
          const url = new URL(urlStr);
          // Ensure it's http or https
          if (url.protocol === "http:" || url.protocol === "https:") {
            cleaned.url = urlStr;
          }
          // If protocol is invalid, don't add url field
        } catch {
          // Invalid URL, don't add url field
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

  let output = result.finalOutput;
  if (!output) {
    throw new Error("ResearchAgent did not produce a final output");
  }

  // Handle case where output might be a string (JSON string)
  if (typeof output === "string") {
    try {
      output = JSON.parse(output);
    } catch (e) {
      throw new Error(`ResearchAgent output is not valid JSON: ${e}`);
    }
  }

  // Clean invalid URLs before validation
  const cleanedOutput = cleanCompetitorUrls(output);
  
  // Validate with schema after cleaning
  return MarketSummarySchema.parse(cleanedOutput);
}


