import express from "express";
import { getMockAnalysis } from "../lib/mockAnalysis.js";
import { callGemini } from "../lib/gemini.js";
import { buildPrompt } from "../lib/prompt.js";
import { calculateScore } from "../lib/scoring.js";
import { applySourceMetadata, extractSourceMetadata } from "../lib/sourceMetadata.js";

const router = express.Router();

const USE_MOCK = false;

// Applique le scoring de crédibilité et fusionne le résultat dans l'analyse.
// cautionLevel est dérivé du score total pour rester cohérent avec le breakdown.
// On appelle ceci APRÈS applySourceMetadata pour que le score reflète les sources détectées.
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

  // Détection de sources (DOI) : enrichit l'analyse et alimente le grounding web de Gemini.
  const sourceMetadata = extractSourceMetadata(article);
  const articleWithMetadata = {
    ...article,
    sourceMetadata
  };

  // Mode mock
  if (USE_MOCK) {
    const mock = applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata);
    return res.json(withScoring(mock));
  }

  // Mode Gemini
  try {
    const prompt = buildPrompt(articleWithMetadata);
    const analysis = await callGemini(prompt, sourceMetadata.doiUrls);
    const enriched = applySourceMetadata(analysis, sourceMetadata);
    res.json(withScoring(enriched));

  } catch (err) {
    console.error("Gemini error:", err.message);

    // Fallback sur le mock si Gemini plante
    console.warn("Falling back to mock analysis.");
    const fallbackAnalysis = applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata);
    fallbackAnalysis.analysisMode = "fallback";
    fallbackAnalysis.error = "Gemini live analysis failed; showing fallback extraction-based analysis.";
    res.json(withScoring(fallbackAnalysis));
  }
});

export default router;
