// sidepanel.js
// Reads the current article, sends it to the backend, and renders SecondRead context.

const API_URL = "http://localhost:3000/api/analyze";

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

function renderCaution(analysis) {
  const level = normalizeCautionLevel(analysis.cautionLevel);
  const tag = document.getElementById("caution-level");

  tag.textContent = level;
  tag.className = `tag tag-${level}`;
  document.getElementById("caution-summary").textContent =
    analysis.cautionSummary || "SecondRead did not return a caution summary.";
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
