import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { generate } from "./pipeline/generate";
import { IntakeSchema } from "./schemas";

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

// Finalize endpoint - placeholder for now
app.post("/finalize", async (req, res) => {
  try {
    // TODO: Implement finalize pipeline
    res.status(501).json({ error: "Finalize endpoint not yet implemented" });
  } catch (error) {
    console.error("Finalize error:", error);
    res.status(500).json({ error: "Internal server error" });
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
