// content.js
// Extracts article data from the current page with Readability.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "EXTRACT_ARTICLE") {

    try {
      const documentClone = document.cloneNode(true);
      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (article) {
        sendResponse({
          success: true,
          article: {
            title: article.title || document.title || "",
            text: article.textContent || "",
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
