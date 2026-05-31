// sidepanel.js
// Reads the current article, sends it to the backend, and renders SecondRead context.

const API_URL = "http://localhost:3000/api/analyze";
const USE_LOCAL_MOCK = false;
const ANALYSIS_SCHEMA_VERSION = 4;

const btnAnalyze = document.getElementById("btn-analyze");
const btnRetry = document.getElementById("btn-retry");
const loadingText = document.getElementById("loading-text");

const states = {
  idle: document.getElementById("state-idle"),
  loading: document.getElementById("state-loading"),
  error: document.getElementById("state-error"),
  results: document.getElementById("state-results")
};

let currentArticle = null;

function showState(name) {
  Object.values(states).forEach((state) => state.classList.add("hidden"));
  states[name].classList.remove("hidden");
}

function showError(message) {
  document.getElementById("error-message").textContent = message;
  btnAnalyze.disabled = false;
  showState("error");
}

async function analyzeCurrentTab() {
  btnAnalyze.disabled = true;
  showState("loading");

  try {
    loadingText.textContent = "Reading the article...";
    const article = await extractArticleFromActiveTab();
    currentArticle = article;
    renderArticlePreview(article);

    loadingText.textContent = "Asking SecondRead for context...";
    const analysis = await requestAnalysis(article);

    renderAnalysis(analysis);
    chrome.storage.local.set({
      lastArticle: article,
      lastAnalysis: analysis,
      analysisSchemaVersion: ANALYSIS_SCHEMA_VERSION
    });
    showState("results");
  } catch (error) {
    showError(error.message || "Unable to analyze this article.");
  } finally {
    btnAnalyze.disabled = false;
  }
}

async function extractArticleFromActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id) {
    throw new Error("No active tab found.");
  }

  const response = await sendExtractArticleMessage(tab.id);

  if (!response?.success || !response.article) {
    throw new Error(response?.error || "This page does not look like a readable article.");
  }

  if (!response.article.text || response.article.text.trim().length < 200) {
    throw new Error("SecondRead needs a longer article body to analyze.");
  }

  return response.article;
}

async function sendExtractArticleMessage(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_ARTICLE" });
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["Readability.js", "content.js"]
    });

    return chrome.tabs.sendMessage(tabId, { type: "EXTRACT_ARTICLE" });
  }
}

function isMissingContentScriptError(error) {
  return /receiving end does not exist|could not establish connection/i.test(error?.message || "");
}

async function requestAnalysis(article) {
  if (USE_LOCAL_MOCK) {
    return getMockAnalysis(article);
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ article })
  });

  if (!response.ok) {
    throw new Error(`Backend returned ${response.status}. Is the Express server running?`);
  }

  return response.json();
}

function getMockAnalysis(article) {
  return {
    quickRead: {
      summary: "This local mock confirms the panel can render the new structure, but it does not inspect outside sources.",
      overallSupport: "unclear",
      confidence: "medium"
    },
    mainClaims: [
      {
        claim: article.title || "Main article claim",
        status: "unclear",
        why: "Local mock mode cannot judge source support.",
        confidence: "medium"
      }
    ],
    evidenceCheck: [
      {
        claim: article.title || "Main article claim",
        support: "Extracted article text",
        supportType: "article assertion",
        sourceMatchesClaim: "unclear",
        explanation: "The backend live analysis needs to check source context.",
        confidence: "medium"
      }
    ]
  };
}

function renderArticlePreview(article) {
  document.getElementById("article-title").textContent = article.title || "Untitled article";
  document.getElementById("article-meta").textContent = buildArticleMeta(article);
  document.getElementById("article-preview-text").textContent = truncate(article.text, 360);
}

function buildArticleMeta(article) {
  const parts = [
    article.siteName,
    article.author ? `By ${article.author}` : null,
    article.publishedAt
  ].filter(Boolean);

  return parts.join(" | ") || article.url;
}

function renderAnalysis(analysis) {
  renderQuickRead(analysis);
  renderOptionalList("section-main-claims", "main-claims", analysis.mainClaims);
  renderOptionalList("section-evidence-check", "evidence-check", analysis.evidenceCheck);
  renderOptionalList("section-original-sources", "original-sources", analysis.originalSources);
  renderOptionalList("section-statistics-explained", "statistics-explained", analysis.statisticsExplained);
  renderOptionalList("section-people-interests", "people-interests", analysis.peopleAndInterests);
  renderOptionalList("section-language-framing", "language-framing", analysis.languageAndFraming);
  renderOptionalList("section-compared-coverage", "compared-coverage", analysis.comparedCoverage);
}

function renderQuickRead(analysis) {
  const quickRead = analysis.quickRead || {};
  const level = levelFromSupport(quickRead.overallSupport);
  const tag = document.getElementById("caution-level");
  const summary = [
    analysis.analysisMode === "fallback" ? "Fallback mode: live analysis did not complete." : null,
    quickRead.summary || "SecondRead did not return a quick read."
  ].filter(Boolean);

  // Just the caution level (low / medium / high), derived from Gemini's overallSupport.
  tag.textContent = capitalize(level);
  tag.className = `tag tag-${level}`;

  // Status icon reflects the level.
  const fruit = document.getElementById("caution-fruit");
  const iconByLevel = {
    low: "icons/vista/status-low.ico",
    medium: "icons/vista/status-medium.ico",
    high: "icons/vista/status-high.ico"
  };
  if (iconByLevel[level]) {
    fruit.src = iconByLevel[level];
    fruit.classList.remove("hidden");
  } else {
    fruit.classList.add("hidden");
  }

  // Summary keeps the fallback notice while still showing the quick-read summary.
  document.getElementById("caution-summary").textContent = summary.join(" ");
}

// Maps Gemini's overallSupport verdict to a caution level.
function levelFromSupport(overallSupport) {
  const support = (overallSupport || "").toLowerCase();
  if (support === "well supported" || support === "mostly supported") return "low";
  if (support === "weakly supported") return "high";
  if (support === "mixed" || support === "unclear" || support === "not enough evidence") return "medium";
  return "unknown";
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderOptionalList(sectionId, listId, items) {
  const section = document.getElementById(sectionId);
  const hasItems = Array.isArray(items) && items.length > 0;
  section.classList.toggle("hidden", !hasItems);

  if (hasItems) {
    renderList(listId, items);
  }
}

function renderList(id, items) {
  const container = document.getElementById(id);
  container.innerHTML = "";

  items.forEach((item) => {
    container.appendChild(renderListItem(item));
  });
}

function renderListItem(item) {
  const wrapper = document.createElement("div");
  wrapper.className = "list-item";

  if (typeof item === "string") {
    const copy = document.createElement("p");
    copy.className = "list-item-copy";
    copy.textContent = item;
    wrapper.appendChild(copy);
    return wrapper;
  }

  const titleText =
    item.claim ||
    item.title ||
    item.name ||
    item.number ||
    item.statistic ||
    item.question ||
    item.source ||
    item.topic ||
    item.label;
  const detailFields = buildItemFields(item);
  const directText = getDirectItemText(item);
  const metaText = [
    item.label && item.label !== titleText ? `Label: ${item.label}` : null,
    item.confidence ? `Confidence: ${item.confidence}` : null
  ].filter(Boolean).join(" | ");

  if (titleText) {
    const title = document.createElement("p");
    title.className = "list-item-title";
    title.textContent = titleText;
    wrapper.appendChild(title);
  }

  if (metaText) {
    const meta = document.createElement("p");
    meta.className = "list-item-copy muted";
    meta.textContent = metaText;
    wrapper.appendChild(meta);
  }

  if (directText) {
    const copy = document.createElement("p");
    copy.className = "list-item-copy";
    copy.textContent = directText;
    wrapper.appendChild(copy);
  } else if (detailFields.length) {
    wrapper.appendChild(renderItemFields(detailFields));
  } else {
    const copy = document.createElement("p");
    copy.className = "list-item-copy";
    copy.textContent = JSON.stringify(item);
    wrapper.appendChild(copy);
  }

  return wrapper;
}

function getDirectItemText(item) {
  return item.basis || item.notes || item.summary || item.context || item.answer || item.url;
}

function buildItemFields(item) {
  return [
    ["Status", item.status],
    ["Why", item.why],
    ["Support", item.support],
    ["Support type", item.supportType],
    ["Source matches claim", item.sourceMatchesClaim],
    ["Explanation", item.explanation],
    ["DOI/link", item.doiOrUrl],
    ["Source type", item.sourceType],
    ["What it studied", item.whatItStudied],
    ["What it found", item.whatItFound],
    ["Represents fairly", item.articleRepresentsFairly],
    ["Limitations", Array.isArray(item.limitations) ? item.limitations.join("; ") : item.limitations],
    ["Meaning", item.meaning],
    ["Evidence kind", item.evidenceKind],
    ["Does prove", item.doesProve],
    ["Does not prove", item.doesNotProve],
    ["Missing context", Array.isArray(item.missingContext) ? item.missingContext.join("; ") : item.missingContext],
    ["Verdict", item.verdict],
    ["Role", item.role],
    ["Known", item.whatIsKnown],
    ["Interest/conflict", item.interestOrConflict],
    ["Text/framing", item.textOrPattern],
    ["Effect", item.effect],
    ["What it adds", item.whatItAdds],
    ["Type", item.sourceType || item.sourceKind || item.roleInArticle || item.evidenceType],
    ["DOI/URL", item.doiOrUrl],
    ["Primary/secondary", item.primaryOrSecondary],
    ["Accessible", typeof item.accessible === "boolean" ? (item.accessible ? "yes" : "no") : null],
    ["Supports", Array.isArray(item.supportsClaims) ? item.supportsClaims.join("; ") : null],
    ["Authors/institution", item.authorsOrInstitution],
    ["Publication date", item.publicationDate],
    ["Main finding", item.mainFinding],
    ["Article representation", item.articleRepresentation],
    ["Limitations", item.limitationsOmitted],
    ["Overstatement", item.overstatement],
    ["Headline matches evidence", item.headlineMatchesEvidence],
    ["Measures", item.measures],
    ["Denominator/baseline", item.denominatorOrBaseline],
    ["Sample size", item.sampleSize],
    ["Time period", item.timePeriod],
    ["Uncertainty", item.uncertainty],
    ["Source linked", typeof item.sourceLinked === "boolean" ? (item.sourceLinked ? "yes" : "no") : null],
    ["Certainty concern", item.certaintyConcern],
    ["Affiliation", item.affiliation],
    ["Expertise", item.areaOfExpertise],
    ["Independence", item.independence],
    ["Relevant ties", item.relevantTies],
    ["Disclosure", item.disclosure]
  ].filter(([, value]) => value);
}

function renderItemFields(fields) {
  const list = document.createElement("div");
  list.className = "detail-list";

  fields.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "detail-row";

    const labelEl = document.createElement("span");
    labelEl.className = "detail-label";
    labelEl.textContent = `${label}:`;

    const valueEl = document.createElement("span");
    valueEl.className = "detail-value";
    valueEl.textContent = value;

    row.append(labelEl, valueEl);
    list.appendChild(row);
  });

  return list;
}

function truncate(text, maxLength) {
  if (!text) return "";
  const cleanText = text.replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxLength) return cleanText;
  return `${cleanText.slice(0, maxLength).trim()}...`;
}

btnAnalyze.addEventListener("click", analyzeCurrentTab);
btnRetry.addEventListener("click", analyzeCurrentTab);

chrome.storage.local.get(["lastArticle", "lastAnalysis", "analysisSchemaVersion"], (data) => {
  if (data.lastArticle && data.lastAnalysis && data.analysisSchemaVersion === ANALYSIS_SCHEMA_VERSION) {
    currentArticle = data.lastArticle;
    renderArticlePreview(data.lastArticle);
    renderAnalysis(data.lastAnalysis);
    showState("results");
  }
});
