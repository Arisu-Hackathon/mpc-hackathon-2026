// sidepanel.js
// Reads the current article, sends it to the backend, and renders SecondRead context.

const API_URL = "http://localhost:3000/api/analyze";
const USE_LOCAL_MOCK = false;

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
    chrome.storage.local.set({ lastArticle: article, lastAnalysis: analysis });
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

  const response = await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_ARTICLE" });

  if (!response?.success || !response.article) {
    throw new Error(response?.error || "This page does not look like a readable article.");
  }

  if (!response.article.text || response.article.text.trim().length < 200) {
    throw new Error("SecondRead needs a longer article body to analyze.");
  }

  return response.article;
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
    cautionLevel: "medium",
    cautionSummary:
      "This article is readable, but several claims would benefit from clearer sourcing before a reader treats them as settled context.",
    redFlags: [
      {
        claim: "The article presents a broad conclusion.",
        label: "worth checking",
        basis: "The extracted text does not clearly show the original evidence behind the claim."
      },
      {
        claim: "Some context may be assumed rather than shown.",
        label: "not enough evidence",
        basis: "SecondRead can only confirm what appears in the article text."
      }
    ],
    evidenceTrail: [
      {
        title: "Article extracted",
        summary: `SecondRead extracted the article from ${article.siteName || "this site"}.`
      },
      {
        title: "Primary source check",
        summary: "No original study, report, filing, or dataset was confirmed from the extracted text."
      }
    ],
    originalStudyOrReport: {
      detected: false,
      title: null,
      url: null,
      notes: "No original source was found in the article text."
    },
    statisticalEvidence: {
      summary: "The mock analysis did not find clear statistical evidence in the article text.",
      sampleSize: null,
      effectSize: null,
      limitations: [
        "Sample size was not visible.",
        "Methodology details were not visible."
      ]
    },
    authorBackground: {
      name: article.author || null,
      knownFromArticle: article.author
        ? "The author name was found in the article metadata."
        : "No author was found in the article metadata.",
      backgroundNotes: [
        "No external author background is checked in local mock mode."
      ]
    },
    publicationContext: {
      outlet: article.siteName || null,
      contextNotes: []
    },
    fundingAndConflicts: [
      "No funding or conflict information was found in the extracted article text."
    ],
    comparedCoverage: [
      "Compared coverage is not available in local mock mode."
    ],
    readerQuestions: [
      "Does the article link to the original source?",
      "Are the strongest claims supported by named evidence?",
      "What information would change how this should be read?"
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
  renderCaution(analysis);
  renderList("red-flags", analysis.redFlags, "No red flags returned.");
  renderList("evidence-trail", analysis.evidenceTrail, "No evidence trail returned.");
  renderOriginalSource(analysis.originalStudyOrReport);
  renderStatisticalEvidence(analysis.statisticalEvidence);
  renderAuthorBackground(analysis.authorBackground);
  renderList("funding-conflicts", analysis.fundingAndConflicts, "No funding or conflict notes returned.");
  renderList("compared-coverage", analysis.comparedCoverage, "No compared coverage returned.");
  renderList("reader-questions", analysis.readerQuestions, "No reader questions returned.");
}

const BREAKDOWN_LABELS = {
  redFlags: "Red flags",
  originalSource: "Source",
  author: "Author",
  statisticalEvidence: "Statistics",
  fundingAndConflicts: "Funding"
};

function renderCaution(analysis) {
  const level = normalizeCautionLevel(analysis.cautionLevel);
  const tag = document.getElementById("caution-level");
  const scoring = analysis.scoring;

  // Show the numeric score when available, otherwise fall back to the level label.
  tag.textContent = scoring ? `${scoring.total} / ${scoring.outOf}` : level;
  tag.className = `tag tag-${level}`;

  document.getElementById("caution-summary").textContent =
    analysis.cautionSummary || "SecondRead did not return a caution summary.";

  renderBreakdown(scoring);
}

function renderBreakdown(scoring) {
  const container = document.getElementById("caution-breakdown");
  container.innerHTML = "";

  if (!scoring || !scoring.breakdown) return;

  Object.entries(scoring.breakdown).forEach(([key, part]) => {
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
    fill.style.width = `${ratio * 100}%`;
    bar.appendChild(fill);

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

function renderOriginalSource(source = {}) {
  const lines = [
    source.detected ? "Original source detected." : "Original source not detected.",
    source.title || null,
    source.url || null,
    source.notes || null
  ].filter(Boolean);

  document.getElementById("original-source").textContent = lines.join(" ");
}

function renderStatisticalEvidence(stats = {}) {
  const limitations = Array.isArray(stats.limitations) ? stats.limitations : [];
  const lines = [
    stats.summary || "No statistical evidence summary returned.",
    stats.sampleSize ? `Sample size: ${stats.sampleSize}.` : null,
    stats.effectSize ? `Effect size: ${stats.effectSize}.` : null,
    limitations.length ? `Limitations: ${limitations.join("; ")}.` : null
  ].filter(Boolean);

  document.getElementById("statistical-evidence").textContent = lines.join(" ");
}

function renderAuthorBackground(author = {}) {
  const notes = Array.isArray(author.backgroundNotes) ? author.backgroundNotes : [];
  const lines = [
    author.name ? `Author: ${author.name}.` : null,
    author.knownFromArticle || "No author background returned.",
    notes.length ? notes.join(" ") : null
  ].filter(Boolean);

  document.getElementById("author-background").textContent = lines.join(" ");
}

function renderList(id, items, emptyMessage) {
  const container = document.getElementById(id);
  container.innerHTML = "";

  if (!Array.isArray(items) || items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "section-copy";
    empty.textContent = emptyMessage;
    container.appendChild(empty);
    return;
  }

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

  const titleText = item.claim || item.title || item.label || item.question || item.source || item.topic;
  const copyText = item.basis || item.notes || item.summary || item.context || item.answer || item.url;

  if (titleText) {
    const title = document.createElement("p");
    title.className = "list-item-title";
    title.textContent = titleText;
    wrapper.appendChild(title);
  }

  const copy = document.createElement("p");
  copy.className = "list-item-copy";
  copy.textContent = copyText || JSON.stringify(item);
  wrapper.appendChild(copy);

  return wrapper;
}

function normalizeCautionLevel(level) {
  if (["low", "medium", "high", "unknown"].includes(level)) {
    return level;
  }

  return "unknown";
}

function truncate(text, maxLength) {
  if (!text) return "";
  const cleanText = text.replace(/\s+/g, " ").trim();

  if (cleanText.length <= maxLength) return cleanText;
  return `${cleanText.slice(0, maxLength).trim()}...`;
}

btnAnalyze.addEventListener("click", analyzeCurrentTab);
btnRetry.addEventListener("click", analyzeCurrentTab);

chrome.storage.local.get(["lastArticle", "lastAnalysis"], (data) => {
  if (data.lastArticle && data.lastAnalysis) {
    currentArticle = data.lastArticle;
    renderArticlePreview(data.lastArticle);
    renderAnalysis(data.lastAnalysis);
    showState("results");
  }
});
