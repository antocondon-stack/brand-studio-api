import PDFDocument from "pdfkit";
import type { RoutesPdfRequest } from "../schemas";

export async function buildRoutesDeckPdf(
  request: RoutesPdfRequest,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const { intake, brand_strategy, creative_directions } = request;
    const primary = "#111111";
    const secondary = "#666666";
    const accent = "#3b82f6";

    // —— Cover ——
    doc.fontSize(32).fillColor(primary).text(intake.brand_name, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(18).fillColor(accent).text("Creative Routes", { align: "center" });
    doc.moveDown(2);
    doc.fontSize(12).fillColor(secondary).text("Three distinct creative directions", { align: "center" });
    doc.addPage();

    // —— Strategy Snapshot ——
    doc.fontSize(20).fillColor(primary).text("Strategy Snapshot", { continued: false });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor(secondary).text(`Positioning: ${brand_strategy.positioning_statement}`, { width: doc.page.width - 100 });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(primary).text("Brand Essence:", { continued: false });
    doc.fontSize(10).fillColor(secondary).text(` ${brand_strategy.brand_essence}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(primary).text("Personality:", { continued: false });
    doc.fontSize(10).fillColor(secondary).text(` ${brand_strategy.personality.join(", ")}`);
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(primary).text("Value Props:", { continued: false });
    brand_strategy.value_props.forEach((vp, i) => {
      doc.fontSize(10).fillColor(secondary).text(`  ${i + 1}. ${vp}`, { indent: 20 });
    });
    doc.addPage();

    // —— Route pages (A/B/C) ——
    for (const route of creative_directions) {
      doc.fontSize(24).fillColor(primary).text(`Route ${route.id}: ${route.name}`, { continued: false });
      doc.moveDown(0.3);
      doc.fontSize(12).fillColor(accent).text(route.visual_thesis, { width: doc.page.width - 100 });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor(secondary).text(route.rationale, { width: doc.page.width - 100 });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor(primary).text("Motif System:", { continued: false });
      doc.fontSize(10).fillColor(secondary).text(` ${route.motif_system.motifs.join(", ")}`);
      doc.moveDown(0.3);
      if (route.motif_system.geometry_notes.length > 0) {
        doc.fontSize(10).fillColor(secondary).text(`Notes: ${route.motif_system.geometry_notes.join("; ")}`, { indent: 20 });
      }
      doc.moveDown(0.3);

      doc.fontSize(11).fillColor(primary).text("Wordmark Style:", { continued: false });
      doc.fontSize(10).fillColor(secondary).text(
        ` ${route.wordmark_style.case}, ${route.wordmark_style.contrast} contrast, ${route.wordmark_style.terminal} terminals, ${route.wordmark_style.tracking} tracking`,
      );
      doc.moveDown(0.3);

      doc.fontSize(11).fillColor(primary).text("Color Logic:", { continued: false });
      doc.fontSize(10).fillColor(secondary).text(` ${route.color_logic}`);
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(secondary).text(`Keywords: ${route.keywords.slice(0, 5).join(", ")}`);
      doc.moveDown(0.3);

      doc.fontSize(11).fillColor(primary).text("Typography Axis:", { continued: false });
      doc.fontSize(10).fillColor(secondary).text(` ${route.typography_axis}`);
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor(primary).text("Design Rules:", { continued: false });
      route.design_rules.slice(0, 6).forEach((rule, i) => {
        doc.fontSize(10).fillColor(secondary).text(`  ${i + 1}. ${rule}`, { indent: 20 });
      });
      doc.moveDown(0.5);

      doc.fontSize(11).fillColor(primary).text("Distinctiveness Hook:", { continued: false });
      doc.fontSize(10).fillColor(secondary).text(` ${route.logo_requirements.distinctiveness_hook}`, { width: doc.page.width - 100 });
      doc.addPage();
    }

    doc.end();
  });
}
