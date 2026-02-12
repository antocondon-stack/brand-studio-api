import express from "express";
import cors from "cors";
import dotenv from "dotenv";

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

// Generate endpoint - placeholder for now
app.post("/generate", async (req, res) => {
  try {
    // TODO: Implement generate pipeline
    res.status(501).json({ error: "Generate endpoint not yet implemented" });
  } catch (error) {
    console.error("Generate error:", error);
    res.status(500).json({ error: "Internal server error" });
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
