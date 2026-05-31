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

const BREAKDOWN_LABELS = {
  claimSupport: "Claim support",
  evidenceMatch: "Evidence",
  sources: "Sources",
  interests: "People",
  framing: "Framing"
};

function renderQuickRead(analysis) {
  const quickRead = analysis.quickRead || {};
  const supportLevel = normalizeSupportLevel(quickRead.overallSupport);
  const cautionLevel = normalizeCautionLevel(analysis.cautionLevel);
  const tag = document.getElementById("caution-level");
  const scoring = analysis.scoring;
  const level = scoring?.cautionLevel || "unknown";
  const summary = [
    analysis.analysisMode === "fallback" ? "Fallback mode: live analysis did not complete." : null,
    quickRead.summary || "SecondRead did not return a quick read."
  ].filter(Boolean);

  // Show the numeric score when available, otherwise fall back to the level label.
  tag.textContent = scoring ? `${scoring.total} / ${scoring.outOf}` : supportLevel;
  tag.className = scoring ? `tag tag-${cautionLevel}` : `tag ${supportTagClass(supportLevel)}`;

  // Cute fruit that reflects the caution level (green apple / orange / strawberry).
  const fruit = document.getElementById("caution-fruit");
  const fruitByLevel = {
    low: "icons/vista/status-low.ico",
    medium: "icons/vista/status-medium.ico",
    high: "icons/vista/status-high.ico"
  };
  if (fruitByLevel[level]) {
    fruit.src = fruitByLevel[level];
    fruit.classList.remove("hidden");
  } else {
    fruit.classList.add("hidden");
  }

  // Summary keeps Souki's fallback notice while still showing the caution summary.
  document.getElementById("caution-summary").textContent = summary.join(" ");

  renderBreakdown(scoring);
}

function renderBreakdown(scoring) {
  const container = document.getElementById("caution-breakdown");
  container.innerHTML = "";

  if (!scoring || !scoring.breakdown) return;

  Object.entries(scoring.breakdown).forEach(([key, part], index) => {
    if (!part || typeof part.score !== "number") return;

    const item = document.createElement("div");
    item.className = "breakdown-item";

    const row = document.createElement("button");
    row.type = "button";
    row.className = "breakdown-row";

    const label = document.createElement("span");
    label.className = "breakdown-label";
    label.textContent = BREAKDOWN_LABELS[key] || key;

    const bar = document.createElement("div");
    bar.className = "breakdown-bar";
    const fill = document.createElement("div");
    fill.className = "breakdown-bar-fill";
    const ratio = part.outOf ? Math.max(0, Math.min(1, part.score / part.outOf)) : 0;
    fill.className = `breakdown-bar-fill ${ratioClass(ratio)}`;
    // Start empty and let it fill up in a staggered cascade on reveal.
    fill.style.width = "0%";
    fill.style.transitionDelay = `${index * 110}ms`;
    bar.appendChild(fill);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        fill.style.width = `${ratio * 100}%`;
      })
    );

    const value = document.createElement("span");
    value.className = "breakdown-value";
    value.textContent = `${part.score}/${part.outOf}`;

    const caret = document.createElement("span");
    caret.className = "breakdown-caret";
    caret.textContent = "▾"; // ▾

    row.append(label, bar, value, caret);
    item.appendChild(row);

    // Tap a row to reveal why it got that score (derived from the real calculation).
    if (part.explanation) {
      const exp = document.createElement("p");
      exp.className = "breakdown-exp hidden";
      exp.textContent = part.explanation;
      item.appendChild(exp);

      row.addEventListener("click", () => {
        const open = exp.classList.toggle("hidden") === false;
        row.classList.toggle("open", open);
      });
    } else {
      row.disabled = true;
    }

    container.appendChild(item);
  });
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
  const copyText = buildItemCopy(item);
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

  const copy = document.createElement("p");
  copy.className = "list-item-copy";
  copy.textContent = copyText || JSON.stringify(item);
  wrapper.appendChild(copy);

  return wrapper;
}

function buildItemCopy(item) {
  const directText = item.basis || item.notes || item.summary || item.context || item.answer || item.url;

  if (directText) {
    return directText;
  }

  const fields = [
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

  if (!fields.length) {
    return JSON.stringify(item);
  }

  return fields.map(([label, value]) => `${label}: ${value}`).join(" ");
}

function normalizeSupportLevel(level) {
  if (["well supported", "mostly supported", "mixed", "unclear", "weakly supported", "not enough evidence"].includes(level)) {
    return level;
  }

  return "unknown";
}

function normalizeCautionLevel(level) {
  if (["low", "medium", "high", "unknown"].includes(level)) {
    return level;
  }

  return "unknown";
}

function supportTagClass(level) {
  if (level === "well supported" || level === "mostly supported") {
    return "tag-low";
  }

  if (level === "mixed" || level === "unclear" || level === "not enough evidence") {
    return "tag-medium";
  }

  if (level === "weakly supported") {
    return "tag-high";
  }

  return "tag-unknown";
}

function ratioClass(ratio) {
  if (ratio >= 0.8) {
    return "fill-good";
  }

  if (ratio >= 0.5) {
    return "fill-mid";
  }

  return "fill-low";
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
