import express from "express";
import { getMockAnalysis } from "../lib/mockAnalysis.js";
import { callGemini } from "../lib/gemini.js";
import { buildPrompt } from "../lib/prompt.js";
import {
  applySourceMetadata,
  extractSourceMetadata,
  gateSourceVerification,
  sourceUrlsToFetch
} from "../lib/sourceMetadata.js";

const router = express.Router();

const USE_MOCK = false;

router.post("/", async (req, res) => {
  const { article } = req.body;

  // Validation de base
  if (!article || !article.text) {
    return res.status(400).json({
      error: "Missing article data. Expected { article: { text, title, url, ... } }"
    });
  }

  // Détection de sources (DOI + liens académiques) : enrichit l'analyse et alimente le grounding Gemini.
  const sourceMetadata = extractSourceMetadata(article);
  const articleWithMetadata = {
    ...article,
    sourceMetadata
  };
  // Tous les liens à faire récupérer par Gemini (DOIs + bmj/nature/PDF…), pas juste les DOIs.
  const fetchUrls = sourceUrlsToFetch(sourceMetadata);

  // Mode mock
  if (USE_MOCK) {
    const mock = gateSourceVerification(applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata));
    return res.json(mock);
  }

  // Mode Gemini
  try {
    const prompt = buildPrompt(articleWithMetadata);
    const analysis = await callGemini(prompt, fetchUrls);
    // Gate APRÈS enrichissement : un verdict "yes" non confirmé par le fetch retombe à "source inaccessible".
    const enriched = gateSourceVerification(applySourceMetadata(analysis, sourceMetadata));
    res.json(enriched);

  } catch (err) {
    console.error("Gemini error:", err.message);

    // Fallback sur le mock si Gemini plante
    console.warn("Falling back to mock analysis.");
    const fallbackAnalysis = gateSourceVerification(
      applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata)
    );
    fallbackAnalysis.analysisMode = "fallback";
    fallbackAnalysis.error = "Gemini live analysis failed; showing fallback extraction-based analysis.";
    res.json(fallbackAnalysis);
  }
});

export default router;
