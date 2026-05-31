export function getMockAnalysis(article) {
  const firstDoi = article.sourceMetadata?.doiStrings?.[0] || article.doiStrings?.[0];
  const doiUrl = firstDoi ? `https://doi.org/${firstDoi}` : null;

  const analysis = {
    quickRead: {
      summary: firstDoi
        ? "The article includes a DOI citation, so the original source is present. This fallback response has not inspected the DOI target, so it cannot yet judge whether the article represents the study fairly."
        : "SecondRead extracted the article, but this fallback response has limited evidence context. Treat source-level judgments as incomplete until Gemini live analysis succeeds.",
      overallSupport: firstDoi ? "not enough evidence" : "unclear",
      confidence: firstDoi ? "high" : "medium"
    },
    mainClaims: [
      {
        claim: article.title || "Main article claim",
        status: "unclear",
        why: "Fallback mode does not analyze the full source context, so it cannot responsibly judge support beyond the extracted article text.",
        confidence: "medium"
      }
    ],
    evidenceCheck: [
      {
        claim: article.title || "Main article claim",
        support: firstDoi ? `DOI citation detected: ${doiUrl}` : "No original source was confirmed from the extracted text.",
        supportType: firstDoi ? "DOI citation" : "article assertion",
        sourceMatchesClaim: firstDoi ? "unclear" : "unclear",
        explanation: firstDoi
          ? "A DOI counts as a source citation, but fallback mode did not inspect the study content."
          : "The live model needs to inspect source context before SecondRead can judge the evidence match.",
        confidence: firstDoi ? "high" : "medium"
      }
    ]
  };

  if (firstDoi) {
    analysis.originalSources = [
      {
        title: "not enough evidence",
        doiOrUrl: doiUrl,
        sourceType: "study",
        whatItStudied: "not enough evidence",
        whatItFound: "not enough evidence",
        articleRepresentsFairly: "unclear",
        limitations: [
          "Fallback mode detected the citation but did not inspect the source."
        ],
        confidence: "high"
      }
    ];
  }

  if (article.author) {
    analysis.peopleAndInterests = [
      {
        name: article.author,
        role: "article author",
        whatIsKnown: "The author name was found in the article metadata.",
        interestOrConflict: "not enough information",
        explanation: "No external author background, funding, or conflict information was checked in fallback mode.",
        confidence: "medium"
      }
    ];
  }

  return analysis;
}
