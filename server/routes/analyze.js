import express from "express";
import { getMockAnalysis } from "../lib/mockAnalysis.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { article } = req.body;

  // Validation de base
  if (!article || !article.text) {
    return res.status(400).json({
      error: "Missing article data. Expected { article: { text, title, url, ... } }"
    });
  }

  try {
    const analysis = getMockAnalysis(article);
    res.json(analysis);

  } catch (err) {
    console.error("Analysis error:", err);
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;