import express from "express";
import { getMockAnalysis } from "../lib/mockAnalysis.js";
import { callGroq } from "../lib/ai.js";
import { buildPrompt } from "../lib/prompt.js";
import { calculateScore } from "../lib/scoring.js";

const router = express.Router();

const USE_MOCK = false;

// Applique le scoring de crédibilité et fusionne le résultat dans l'analyse.
// cautionLevel est dérivé du score total pour rester cohérent avec le breakdown.
function withScoring(analysis) {
  const scoring = calculateScore(analysis);

  return {
    ...analysis,
    cautionLevel: scoring.cautionLevel,
    scoring
  };
}

router.post("/", async (req, res) => {
  const { article } = req.body;

  // Validation de base
  if (!article || !article.text) {
    return res.status(400).json({
      error: "Missing article data. Expected { article: { text, title, url, ... } }"
    });
  }

  // Mode mock
  if (USE_MOCK) {
    return res.json(withScoring(getMockAnalysis(article)));
  }

  // Mode Groq
  try {
    const prompt = buildPrompt(article);
    const analysis = await callGroq(prompt);
    res.json(withScoring(analysis));

  } catch (err) {
    console.error("Groq error:", err.message);

    // Fallback sur le mock si Groq plante
    console.warn("Falling back to mock analysis.");
    res.json(withScoring(getMockAnalysis(article)));
  }
});

export default router;