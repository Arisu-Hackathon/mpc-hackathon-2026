# SecondRead

SecondRead is a Chrome extension that adds **cautious credibility context** while
someone reads a news article. It is **not** a fake-news detector and **not** a
truth-score app — it gives a calm "second layer" of context so a reader can judge
an article for themselves.

## Core principles

- Never says an article is "true" or "false", and assigns no truth score.
- Uses cautious, neutral language only.
- Distinguishes **facts from inference**, and **a source being cited** from
  **a source actually being verified**.
- Never invents author background, study funding, conflicts of interest, or links.
- When it cannot verify something, it says so (e.g. *"source detected but not analyzed"*).

---

## Architecture

```
Chrome article page
  → content.js          extracts the article (Readability) + links + DOIs
  → sidepanel.js        sends the article to the backend, renders the result
  → POST /api/analyze   Express backend
       → extractSourceMetadata   find DOIs + academic/source links
       → buildPrompt             build the SecondRead prompt
       → callGemini              analyze (with web grounding of the sources)
       → applySourceMetadata     inject detected sources as originalSources
       → gateSourceVerification  downgrade unverified source verdicts
  → sidepanel.js        renders Quick read + sections
```

If the live model call fails, the backend falls back to a mock analysis
(`analysisMode: "fallback"`) so the panel always renders something.

---

## Project structure

```text
extension/
  manifest.json        MV3 manifest (side panel, content script, icons)
  background.js        opens the side panel on the toolbar click
  content.js           extracts title/text/author/date/links/DOIs (Readability)
  Readability.js       Mozilla Readability (article extraction)
  sidepanel.html       side panel markup
  sidepanel.css        Frutiger Aero theme (glass, bubbles, glossy buttons)
  sidepanel.js         reads the tab, calls the backend, renders the analysis
  icons/
    logo_appli.png     app icon (used by the manifest — must be PNG)
    vista/             section + status icons (.ico) used inside the panel

server/
  server.js            Express app + /health
  routes/
    analyze.js         POST /api/analyze (orchestrates the pipeline)
  lib/
    gemini.js          Gemini call + URL-context/web grounding  (PRIMARY)
    ai.js              Groq call (alternative model, no web access)
    prompt.js          builds the SecondRead prompt + JSON schema
    sourceMetadata.js  source-link detection, injection, grounding gate
    mockAnalysis.js    offline/fallback analysis in the schema below
  package.json
  .env                 API keys (not committed)
```

---

## Setup

### 1. Backend

```bash
cd server
npm install
npm run dev          # node server.js → http://localhost:3000
```

Create `server/.env`:

```text
# Primary model (live analysis + source grounding)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash          # optional, this is the default
GEMINI_ENABLE_WEB_TOOLS=true           # optional; "false" disables URL grounding

# Alternative model (see "Switching models")
GROQ_API_KEY=your_groq_api_key_here

PORT=3000                              # optional, default 3000
```

Without a valid key the backend still runs and returns the **fallback mock**.

### 2. Extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. Open a news article, **refresh the tab**, then open the SecondRead side panel
   and click **Analyze**.

After changing extension code: reload it in `chrome://extensions` **and refresh
the article tab** (so the content script is re-injected).

---

## How analysis works

### Endpoint

```text
POST http://localhost:3000/api/analyze
Body: { "article": { title, text, author, publishedAt, siteName, url,
                     links, doiStrings, referencesText, rawBodyText } }
```

### Analysis schema (returned to the panel)

`quickRead`, `mainClaims` and `evidenceCheck` are always present; the rest are
optional and only appear when relevant.

```jsonc
{
  "quickRead": {
    "summary": "plain-English judgment of how well the article supports its claims",
    "overallSupport": "well supported | mostly supported | mixed | unclear | weakly supported | not enough evidence",
    "confidence": "high | medium | low | unknown"
  },
  "mainClaims":        [ { "claim", "status", "why", "confidence" } ],
  "evidenceCheck":     [ { "claim", "support", "supportType", "sourceMatchesClaim", "explanation", "confidence" } ],
  "originalSources":   [ { "title", "doiOrUrl", "sourceType", "whatItStudied", "whatItFound", "articleRepresentsFairly", "limitations", "confidence" } ],
  "statisticsExplained":[ { "number", "meaning", "source", "evidenceKind", "doesProve", "doesNotProve", "missingContext", "verdict", "confidence" } ],
  "peopleAndInterests":[ { "name", "role", "whatIsKnown", "interestOrConflict", "explanation", "confidence" } ],
  "languageAndFraming":[ { "textOrPattern", "effect", "verdict", "confidence" } ],
  "comparedCoverage":  [ { "source", "whatItAdds", "confidence" } ]
}
```

### Quick read level (High / Medium / Low)

The panel shows a single pill derived from `quickRead.overallSupport`. **High is
best** (credible), low is weak:

| overallSupport | Pill | Colour | Icon |
|---|---|---|---|
| well / mostly supported | **High** | green | `status-high.ico` |
| mixed / unclear / not enough evidence | **Medium** | amber | `status-medium.ico` |
| weakly supported | **Low** | red | `status-low.ico` |

There is no numeric score — the per-category scoring system was removed in favour
of this single, honest level.

---

## Source detection (the heart of SecondRead)

SecondRead is built around finding the **original source**. Detection is
model-agnostic and happens in the backend:

- `content.js` passes every article link, plus any DOI strings and a references
  section, to the backend.
- `sourceMetadata.js` detects sources two ways:
  - **DOI pattern** (`10.xxxx/...`) in text or links.
  - **Known academic / primary-source domains**: doi.org, BMJ, PubMed/NCBI,
    Europe PMC, Nature, Science, The Lancet, NEJM, Cell, JAMA, ScienceDirect,
    Springer, Wiley, Taylor & Francis, PLOS, arXiv, bioRxiv/medRxiv, Cochrane,
    Frontiers, MDPI, Oxford Academic, WHO, CDC, NIH — plus any `.pdf` link.
- Every detected source is added to `originalSources`, so the panel **never says
  "no source link provided" when a source link exists**.

### Verification gating

Because the model can claim it "verified" a source it never actually opened,
`gateSourceVerification` keeps a `yes / partly / no` representation verdict **only
if Gemini's URL-context metadata confirms the source was really retrieved**.
Otherwise the verdict is downgraded to **`source inaccessible`** ("source detected
but not analyzed"). This keeps the result honest and consistent run-to-run.

---

## Switching models

`routes/analyze.js` uses **Gemini** by default:

```js
import { callGemini } from "../lib/gemini.js";
// ...
const analysis = await callGemini(prompt, fetchUrls);
```

To use **Groq** instead (faster, but **no web access** — it cannot open source
links, so verification stays at "source inaccessible"):

```js
import { callGroq } from "../lib/ai.js";
// ...
const analysis = await callGroq(prompt, fetchUrls);
```

Only the import and the call need to change; the rest of the pipeline is identical.

---

## UI notes

- **Frutiger Aero theme**: soft aqua background, gently floating glass bubbles,
  frosted-glass cards, glossy candy buttons. Respects `prefers-reduced-motion`.
- The **Analyze** button has a breathing halo at rest and a glossy sheen on hover.
- Each section card uses an icon from `icons/vista/` and shows findings as
  `LABEL → value` rows (label = small aqua tag, value = the readable content).
- Manifest icons must be **PNG** (`logo_appli.png`); Chrome does not accept `.ico`
  for manifest icons (the in-panel `.ico` section icons are fine in `<img>`).

---

## Tech stack

- Chrome Extension **Manifest V3**, plain JavaScript / HTML / CSS.
- **Express** backend (ES modules), `cors` + `dotenv`.
- **Gemini** (`gemini-2.5-flash`) with URL-context + Google Search grounding;
  **Groq** (`llama-3.3-70b-versatile`) available as an alternative.
- Mozilla **Readability** for article extraction.
```

## Presentation
https://ulavaldti-my.sharepoint.com/:p:/r/personal/soelb9_ulaval_ca/Documents/SecondRead_News_Context.pptx?d=w56d5e16fb05347e78251d6f9c4ae86b1&csf=1&web=1&e=TRXBaf
