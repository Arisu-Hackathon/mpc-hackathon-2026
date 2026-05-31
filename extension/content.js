// content.js
// Extracts article data from the current page with Readability.
const DOI_REGEX = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;
const MAX_RAW_TEXT_LENGTH = 12000;
const MAX_REFERENCES_LENGTH = 3000;
const MAX_LINKS = 150;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_ARTICLE") {

    try {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();
      const readabilityText = article?.textContent || "";
      const rawBodyText = document.body?.innerText || "";
      const pageLinks = extractPageLinks();
      const referencesText = extractReferencesText(rawBodyText);
      const doiStrings = extractDoiStrings([
        readabilityText,
        rawBodyText,
        referencesText,
        ...pageLinks.flatMap((link) => [link.href, link.text])
      ]);

      if (article) {
        sendResponse({
          success: true,
          article: {
            title: article.title || document.title || "",
            text: readabilityText,
            rawBodyText: rawBodyText.slice(0, MAX_RAW_TEXT_LENGTH),
            referencesText,
            doiStrings,
            links: pageLinks,
            author: article.byline || null,
            publishedAt: getPublishedDate(),
            siteName: getSiteName(),
            url: window.location.href
          }
        });
      } else {
        sendResponse({
          success: false,
          error: "Could not extract an article from this page."
        });
      }

    } catch (e) {
      sendResponse({
        success: false,
        error: e.message
      });
    }

    return true;
  }
});

function extractDoiStrings(values) {
  const dois = new Set();

  values.filter(Boolean).forEach((value) => {
    const matches = String(value).match(DOI_REGEX) || [];
    matches.forEach((doi) => {
      dois.add(normalizeDoi(doi));
    });
  });

  return Array.from(dois);
}

function normalizeDoi(doi) {
  return doi
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/[)\].,;:]+$/g, "")
    .toLowerCase();
}

function extractPageLinks() {
  return Array.from(document.links)
    .map((link) => ({
      text: cleanText(link.innerText || link.textContent || ""),
      href: link.href
    }))
    .filter((link) => link.href)
    .slice(0, MAX_LINKS);
}

function extractReferencesText(rawBodyText) {
  if (!rawBodyText) return "";

  const lines = rawBodyText.split(/\n+/).map(cleanText).filter(Boolean);
  const startIndex = lines.findIndex((line) =>
    /^(references?|sources?|citations?|article reference|further reading)$/i.test(line)
  );

  if (startIndex === -1) {
    return "";
  }

  return lines.slice(startIndex, startIndex + 20).join("\n").slice(0, MAX_REFERENCES_LENGTH);
}

function cleanText(text) {
  return text.replace(/\s+/g, " ").trim();
}

function getSiteName() {
  const siteName =
    document.querySelector('meta[property="og:site_name"]')?.content ||
    document.querySelector('meta[name="application-name"]')?.content;

  return siteName || window.location.hostname.replace(/^www\./, "");
}

function getPublishedDate() {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
    'meta[name="date"]',
    'time[datetime]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    const value = element?.content || element?.dateTime || element?.getAttribute("datetime");

    if (value) return value;
  }

  return null;
}
