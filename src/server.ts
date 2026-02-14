import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { generate } from "./pipeline/generate";
import { finalize } from "./pipeline/finalize";
import { getGuidelinesPdf, getRoutesPdf, storeRoutesPdf } from "./pdf/store";
import { buildRoutesDeckPdf } from "./pdf/routesDeck";
import { getBaseUrl } from "./utils/baseUrl";
import { IntakeSchema, FinalizeRequestSchema, RoutesPdfRequestSchema } from "./schemas";
import { runWordmarkEngine, WordmarkEngineInputSchema } from "./tools/wordmarkEngine.tool";
import { runWordmarkVariants, WordmarkVariantsInputSchema } from "./tools/wordmarkVariants.tool";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 8787;

// Log port configuration for debugging
console.log(`Port configuration: ${process.env.PORT ? `Using Railway PORT: ${process.env.PORT}` : `Using fallback PORT: ${PORT}`}`);

// Middleware
app.use(cors());
app.use(express.json());

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error", message: err?.message || "Unknown error" });
});

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Brand Studio API is running", port: PORT });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy", port: PORT });
});

// Generate endpoint
app.post("/generate", async (req, res) => {
  try {
    console.log("📥 Received generate request");
    
    // Validate request body
    const intake = IntakeSchema.parse(req.body);
    console.log("✅ Intake validated:", intake.brand_name);

    // Run generate pipeline
    const result = await generate(intake);
    
    console.log("✅ Generate pipeline completed successfully");
    res.json(result);
  } catch (error) {
    console.error("❌ Generate error:", error);
    
    if (error instanceof Error) {
      // Handle validation errors
      if (error.name === "ZodError") {
        res.status(400).json({ 
          error: "Invalid request", 
          details: error.message 
        });
        return;
      }
      
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Finalize endpoint
app.post("/finalize", async (req, res) => {
  try {
    console.log("📥 Received finalize request");
    
    // Validate request body
    const request = FinalizeRequestSchema.parse(req.body);
    console.log("✅ Finalize request validated, chosen direction:", request.chosen_direction.id);

    // Run finalize pipeline
    const result = await finalize(request);

    if (result.guidelines_pdf_id) {
      const baseUrl = getBaseUrl(req);
      (result as Record<string, unknown>).guidelines_pdf_url = `${baseUrl}/guidelines/${result.guidelines_pdf_id}.pdf`;
      delete (result as Record<string, unknown>).guidelines_pdf_id;
    }

    console.log("✅ Finalize pipeline completed successfully", {
      regen_seed: result.regen_seed,
      regen: request.regen === true,
    });
    res.json(result);
  } catch (error) {
    console.error("❌ Finalize error:", error);
    
    if (error instanceof Error) {
      // Handle validation errors
      if (error.name === "ZodError") {
        res.status(400).json({ 
          error: "Invalid request", 
          details: error.message 
        });
        return;
      }
      
      res.status(500).json({ 
        error: "Internal server error", 
        message: error.message 
      });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Routes PDF endpoint
app.post("/routes-pdf", async (req, res) => {
  try {
    console.log("📥 Received routes-pdf request");
    const request = RoutesPdfRequestSchema.parse(req.body);
    console.log("✅ Routes PDF request validated");

    const pdfBuffer = await buildRoutesDeckPdf(request);
    const pdfId = storeRoutesPdf(pdfBuffer);
    const baseUrl = getBaseUrl(req);
    const routes_pdf_url = `${baseUrl}/routes/${pdfId}.pdf`;

    console.log("✅ Routes PDF generated:", routes_pdf_url);
    res.json({ routes_pdf_url });
  } catch (error) {
    console.error("❌ Routes PDF error:", error);
    if (error instanceof Error) {
      if (error.name === "ZodError") {
        res.status(400).json({ error: "Invalid request", details: error.message });
        return;
      }
      res.status(500).json({ error: "Internal server error", message: error.message });
    } else {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// Guidelines PDF download (in-memory store; id from finalize response guidelines_pdf_id)
app.get("/guidelines/:id", (req, res) => {
  const id = (req.params.id ?? "").replace(/\.pdf$/i, "");
  if (!id) {
    res.status(400).json({ error: "Missing guidelines id" });
    return;
  }
  const buffer = getGuidelinesPdf(id);
  if (!buffer) {
    res.status(404).json({ error: "Guidelines not found or expired" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="brand-guidelines-${id}.pdf"`);
  res.send(buffer);
});

// Routes PDF download
app.get("/routes/:id", (req, res) => {
  const id = (req.params.id ?? "").replace(/\.pdf$/i, "");
  if (!id) {
    res.status(400).json({ error: "Missing routes id" });
    return;
  }
  const buffer = getRoutesPdf(id);
  if (!buffer) {
    res.status(404).json({ error: "Routes PDF not found or expired" });
    return;
  }
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="creative-routes-${id}.pdf"`);
  res.send(buffer);
});

// Wordmark engine: single wordmark from settings
app.post("/api/wordmark", async (req, res) => {
  try {
    const input = WordmarkEngineInputSchema.parse(req.body);
    const result = await runWordmarkEngine(input);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({ error: "Invalid request", details: error.message });
      return;
    }
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Wordmark variants: 12 variants, ranked by evaluator
app.post("/api/wordmark/variants", async (req, res) => {
  try {
    const input = WordmarkVariantsInputSchema.parse(req.body);
    const result = await runWordmarkVariants(input);
    res.json(result);
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      res.status(400).json({ error: "Invalid request", details: error.message });
      return;
    }
    res.status(500).json({
      error: "Internal server error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

// Static assets (for /wordmark UI)
const publicDir = path.join(process.cwd(), "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}
// Wordmark customizer page (serve HTML)
app.get("/wordmark", (req, res) => {
  const htmlPath = path.join(process.cwd(), "public", "wordmark.html");
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).json({ error: "Wordmark page not found. Ensure public/wordmark.html exists." });
  }
});

// Start server with error handling
try {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Brand Studio API server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  }).on("error", (err: Error) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
} catch (error) {
  console.error("Server startup error:", error);
  process.exit(1);
}
