export function getMockAnalysis(article) {
  return {
    cautionLevel: "medium",
    cautionSummary: "Some claims in this article are worth a second look.",

    redFlags: [
      {
        claim: "Statistics are mentioned without a source link.",
        label: "worth checking",
        basis: "No direct link to the original study was found in the article."
      },
      {
        claim: "Author background is not disclosed.",
        label: "not enough evidence",
        basis: "The byline does not include credentials or affiliation."
      }
    ],

    evidenceTrail: [
      {
        type: "claim",
        text: "The article references a study but does not name it.",
        label: "methodology unclear"
      }
    ],

    readerQuestions: [
      "Where is the original source for the statistics?",
      "Does the article distinguish between correlation and causation?",
      "What evidence would change the main interpretation?"
    ],

    meta: {
      analyzedTitle: article.title || "Unknown",
      analyzedUrl: article.url || "Unknown",
      analyzedAt: new Date().toISOString()
    }
  };
}