import dotenv from "dotenv";
dotenv.config();

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const ENABLE_WEB_TOOLS = process.env.GEMINI_ENABLE_WEB_TOOLS !== "false";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export async function callGemini(prompt, sourceUrls = []) {
  if (!GEMINI_KEY) {
    throw new Error("GEMINI_API_KEY is missing from .env");
  }

  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.2
    }
  };

  if (ENABLE_WEB_TOOLS && sourceUrls.length > 0) {
    body.tools = [
      { url_context: {} },
      { google_search: {} }
    ];
  } else {
    body.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(GEMINI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gemini API error ${response.status}: ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const raw = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!raw) {
    throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`);
  }

  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    const analysis = JSON.parse(clean);
    analysis.retrievalMetadata =
      data.candidates?.[0]?.url_context_metadata ||
      data.candidates?.[0]?.urlContextMetadata ||
      null;
    return analysis;
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${raw}`);
  }
}
