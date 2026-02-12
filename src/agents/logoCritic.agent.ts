import { Agent, run } from "@openai/agents";
import { LogoCriticOutputSchema, type LogoCriticOutput } from "../schemas";

export const LogoCriticAgent = new Agent({
  name: "LogoCriticAgent",
  instructions: `You are a logo critic. Evaluate the provided logo kit (wordmark and mark SVGs, palette, creative direction context) against professional standards.

Output ONLY valid JSON with EXACT keys:
{
  "scores": {
    "on_brief": 0-100,
    "distinctiveness": 0-100,
    "craft": 0-100,
    "scalability": 0-100,
    "cliche_risk": 0-100,
    "ai_look_risk": 0-100
  },
  "issues": ["issue 1", "issue 2", ...],
  "actions": ["actionable fix 1", "actionable fix 2", ...],
  "pass": true or false
}

Scoring rules:
- on_brief: How well the logo matches the creative direction and brand brief (0-100).
- distinctiveness: How memorable and differentiated from competitors (0-100).
- craft: Technical execution, balance, clarity of shapes (0-100).
- scalability: Works at small and large sizes (0-100).
- cliche_risk: Likelihood of feeling generic or overused (0 = low risk, 100 = high risk).
- ai_look_risk: Likelihood of looking AI-generated or templated (0 = low risk, 100 = high risk).

Pass criteria (all must be met):
- on_brief >= 80
- distinctiveness >= 80
- craft >= 80
- scalability >= 75
- cliche_risk <= 30
- ai_look_risk <= 30

Set "pass" to true only when ALL pass criteria are satisfied. Otherwise false.

"issues": List specific problems (e.g. "Wordmark too generic for sector").
"actions": List concrete, actionable improvements for the next iteration (e.g. "Increase letter spacing for distinctiveness", "Simplify mark for better scalability").`,
  model: "gpt-4.1",
  outputType: LogoCriticOutputSchema,
});

export async function runLogoCriticAgent(
  kitSummary: { logo_svg_wordmark: string; logo_svg_mark: string; palette: unknown; chosen_direction_name: string; brand_name: string },
): Promise<LogoCriticOutput> {
  const result = await run(
    LogoCriticAgent,
    [
      {
        role: "user",
        content: [
          "Evaluate this logo kit. Consider the wordmark SVG, mark SVG, palette, and context.",
          "Return the required JSON with scores, issues, actions, and pass.",
          "",
          "Brand: " + kitSummary.brand_name,
          "Direction: " + kitSummary.chosen_direction_name,
          "",
          "Wordmark SVG (excerpt):",
          kitSummary.logo_svg_wordmark.substring(0, 800),
          "",
          "Mark SVG (excerpt):",
          kitSummary.logo_svg_mark.substring(0, 800),
          "",
          "Palette:",
          JSON.stringify(kitSummary.palette),
        ].join("\n"),
      },
    ],
  );

  const output = result.finalOutput;
  if (!output) {
    throw new Error("LogoCriticAgent did not produce a final output");
  }

  return LogoCriticOutputSchema.parse(output);
}

/**
 * Score a single logo concept (idea/preview). Used to rank concept candidates.
 */
export async function runLogoCriticAgentForConcept(
  concept: { id: number; motif_family: string; composition: string; description?: string | undefined; preview_base64?: string | undefined },
  brandName: string,
  directionName: string,
): Promise<LogoCriticOutput> {
  const content = [
    "Evaluate this logo CONCEPT (idea). Score the concept idea for potential.",
    "Return the required JSON with scores, issues, actions, and pass.",
    "",
    "Brand: " + brandName,
    "Direction: " + directionName,
    "",
    "Concept: id=" +
      concept.id +
      ", motif_family=" +
      concept.motif_family +
      ", composition=" +
      concept.composition +
      (concept.description ? ", description=" + concept.description : ""),
  ].join("\n");

  const result = await run(LogoCriticAgent, [{ role: "user", content }]);

  const output = result.finalOutput;
  if (!output) {
    throw new Error("LogoCriticAgent did not produce a final output");
  }

  return LogoCriticOutputSchema.parse(output);
}

/**
 * Compute a single numeric score for ranking (higher = better).
 */
export function conceptScoreFromCritic(output: LogoCriticOutput): number {
  const s = output.scores;
  return s.on_brief + s.distinctiveness + s.craft + s.scalability - s.cliche_risk - s.ai_look_risk;
}
