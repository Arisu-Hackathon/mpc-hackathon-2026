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

  const sourceContext = ENABLE_WEB_TOOLS && sourceUrls.length > 0
    ? await retrieveSourceContext(sourceUrls)
    : null;

  const promptWithSourceContext = sourceContext
    ? `${prompt}

Retrieved source context from DOI/source URLs:
${sourceContext.text}

Use the retrieved source context above when filling quickRead, mainClaims, evidenceCheck, originalSources, statisticsExplained, and peopleAndInterests. If the retrieved source context is limited, say what remains unknown.`
    : prompt;

  const data = await requestGemini({
    contents: [
      {
        role: "user",
        parts: [{ text: promptWithSourceContext }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  });

  const raw = extractText(data);

  if (!raw) {
    throw new Error(`Gemini returned no text: ${JSON.stringify(data)}`);
  }

  const clean = raw.replace(/```json|```/g, "").trim();

  try {
    const analysis = JSON.parse(clean);
    analysis.retrievalMetadata = sourceContext?.metadata || null;
    return analysis;
  } catch (e) {
    throw new Error(`Failed to parse Gemini response as JSON: ${raw}`);
  }
}

async function retrieveSourceContext(sourceUrls) {
  const urls = sourceUrls.slice(0, 5);
  const prompt = `
Use URL context to inspect these source URLs:
${urls.map((url) => `- ${url}`).join("\n")}

Return a concise plain-text source report with:
- retrieval/access status for each URL
- source title
- authors/institution
- publication date
- source type, such as peer-reviewed study, preprint, report, poll, dataset, or unknown
- main finding
- important statistics, sample size, methods, and limitations
- funding or conflict notes if visible
Do not return JSON.`;

  const data = await requestGemini({
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    tools: [
      { url_context: {} },
      { google_search: {} }
    ],
    generationConfig: {
      temperature: 0.2
    }
  });

  const text = extractText(data);
  const metadata =
    data.candidates?.[0]?.url_context_metadata ||
    data.candidates?.[0]?.urlContextMetadata ||
    null;

  if (text) {
    return { text, metadata };
  }

  return {
    text: `Gemini retrieved URL metadata but returned no source summary. Metadata: ${JSON.stringify(metadata || data)}`,
    metadata
  };
}

async function requestGemini(body) {
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

  return response.json();
}

function extractText(data) {
  return data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
}
