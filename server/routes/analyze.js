import express from "express";
import { getMockAnalysis } from "../lib/mockAnalysis.js";
import { callGemini } from "../lib/gemini.js";
import { buildPrompt } from "../lib/prompt.js";
import { applySourceMetadata, extractSourceMetadata } from "../lib/sourceMetadata.js";

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

  const sourceMetadata = extractSourceMetadata(article);
  const articleWithMetadata = {
    ...article,
    sourceMetadata
  };

  // Mode mock
  if (USE_MOCK) {
    return res.json(applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata));
  }

  // Mode Gemini
  try {
    const prompt = buildPrompt(articleWithMetadata);
    const analysis = await callGemini(prompt, sourceMetadata.doiUrls);
    res.json(applySourceMetadata(analysis, sourceMetadata));

  } catch (err) {
    console.error("Gemini error:", err.message);

    // Fallback sur le mock si Gemini plante
    console.warn("Falling back to mock analysis.");
    const fallbackAnalysis = applySourceMetadata(getMockAnalysis(articleWithMetadata), sourceMetadata);
    fallbackAnalysis.analysisMode = "fallback";
    fallbackAnalysis.error = "Gemini live analysis failed; showing fallback extraction-based analysis.";
    res.json(fallbackAnalysis);
  }
});

export default router;
