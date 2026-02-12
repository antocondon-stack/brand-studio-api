import PDFDocument from "pdfkit";
import sharp from "sharp";
import type { FinalKit } from "../schemas";
import type { Intake } from "../schemas";
import type { BrandStrategy } from "../schemas";
import type { CreativeDirection } from "../schemas";

async function svgToPng(svg: string, maxWidth: number): Promise<Buffer> {
  const buf = Buffer.from(svg, "utf8");
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 24;
  const scale = maxWidth / w;
  return sharp(buf)
    .resize(Math.round(w * scale))
    .png()
    .toBuffer();
}

export async function buildGuidelinesPdf(
  finalKit: FinalKit,
  intake: Intake,
  strategy: BrandStrategy,
  direction: CreativeDirection,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = "#111111";
    const secondary = "#444444";

    // —— Cover ——
    doc.fontSize(28).fillColor(primary).text(intake.brand_name, { align: "center" });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(secondary).text(direction.name, { align: "center" });
    doc.moveDown(1);
    doc.fontSize(12).text(direction.visual_thesis, { align: "center", width: doc.page.width - 100 });
    doc.moveDown(2);
    doc.fontSize(10).fillColor(secondary).text("Brand Guidelines", { align: "center" });
    doc.addPage();

    // —— Logo: wordmark, mark, lockups, do/don't ——
    doc.fontSize(16).fillColor(primary).text("Logo", { continued: false });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor(secondary).text("Wordmark and mark. Use approved lockups only.");
    doc.moveDown(1);

    (async () => {
      try {
        const wordmarkPng = await svgToPng(finalKit.logo_svg_wordmark, 400);
        const markPng = await svgToPng(finalKit.logo_svg_mark, 120);
        doc.image(wordmarkPng, 50, doc.y, { width: 400 });
        doc.y += 100;
        doc.image(markPng, 50, doc.y, { width: 120 });
        doc.y += 140;
        doc.fontSize(11).fillColor(primary).text("Horizontal lockup (mark + wordmark)");
        doc.y += 4;
        doc.image(markPng, 50, doc.y, { width: 60 });
        doc.image(wordmarkPng, 120, doc.y + 15, { width: 280 });
        doc.y += 100;
        doc.fontSize(11).fillColor(primary).text("Stacked lockup");
        doc.y += 4;
        doc.image(markPng, 50, doc.y, { width: 80 });
        doc.image(wordmarkPng, 50, doc.y + 90, { width: 300 });
        doc.y += 200;
        doc.fontSize(10).fillColor(secondary).text("Do: scale proportionally. Don't: stretch, distort, or change spacing.");
        doc.addPage();

        // —— Clearspace + min size ——
        doc.fontSize(16).fillColor(primary).text("Clearspace & minimum size", { continued: false });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor(secondary)
          .text("Minimum clearspace: 1× the height of the mark. Minimum size: wordmark 16px equivalent; mark 24px grid.")
        doc.text("Construction: 24×24 grid, stroke and corner radius as specified in the mark.")
        doc.moveDown(1);
        doc.addPage();

        // —— Color palette ——
        doc.fontSize(16).fillColor(primary).text("Color palette", { continued: false });
        doc.moveDown(0.5);
        let yPalette = doc.y;
        for (const c of finalKit.palette) {
          doc.rect(50, yPalette, 24, 24).fill(c.hex);
          doc.fillColor(primary).fontSize(10).text(`${c.role}: ${c.hex}`, 84, yPalette + 4);
          yPalette += 32;
        }
        doc.y = yPalette + 20;
        doc.addPage();

        // —— Typography ——
        doc.fontSize(16).fillColor(primary).text("Typography", { continued: false });
        doc.moveDown(0.5);
        const heading = finalKit.fonts.find((f) => f.role.toLowerCase() === "heading") ?? finalKit.fonts[0];
        const body = finalKit.fonts.find((f) => f.role.toLowerCase() === "body") ?? finalKit.fonts[1] ?? finalKit.fonts[0];
        if (heading) {
          doc.fontSize(14).fillColor(primary).text(`Heading: ${heading.family} (${heading.weight})`, { continued: false });
          doc.fontSize(12).text("The quick brown fox — hierarchy example.");
          doc.moveDown(0.5);
        }
        if (body) {
          doc.fontSize(10).fillColor(secondary).text(`Body: ${body.family} (${body.weight})`, { continued: false });
          doc.fontSize(10).text("Body copy for paragraphs and UI. Use for long-form content.");
        }
        doc.moveDown(1);
        doc.addPage();

        // —— Templates ——
        doc.fontSize(16).fillColor(primary).text("Templates", { continued: false });
        doc.moveDown(0.5);
        const socialPng = await svgToPng(finalKit.templates.social_post.preview_svg, 320);
        const heroPng = await svgToPng(finalKit.templates.website_hero.preview_svg, 400);
        doc.fontSize(11).fillColor(primary).text("Social post");
        doc.image(socialPng, 50, doc.y + 4, { width: 320 });
        doc.y += 330;
        doc.fontSize(11).fillColor(primary).text("Website hero");
        doc.image(heroPng, 50, doc.y + 4, { width: 400 });
        doc.y += 220;
        doc.addPage();

        // —— Usage notes ——
        doc.fontSize(16).fillColor(primary).text("Usage notes", { continued: false });
        doc.moveDown(0.5);
        const rules: string[] = [
          ...direction.design_rules.slice(0, 8),
          `Tone: ${intake.tone}.`,
          strategy.do_nots?.length ? `Avoid: ${strategy.do_nots.slice(0, 2).join("; ")}.` : "",
        ].filter(Boolean);
        doc.fontSize(10).fillColor(secondary);
        rules.forEach((r, i) => {
          doc.text(`${i + 1}. ${r}`, { width: doc.page.width - 100 });
        });
        doc.end();
      } catch (e) {
        reject(e);
      }
    })();
  });
}
