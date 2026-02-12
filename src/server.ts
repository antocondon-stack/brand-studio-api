import express from "express";
import cors from "cors";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 8787;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "Brand Studio API is running" });
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
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

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Brand Studio API server running on port ${PORT}`);
});
