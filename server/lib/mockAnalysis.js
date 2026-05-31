export function getMockAnalysis(article) {
  const firstDoi = article.sourceMetadata?.doiStrings?.[0] || article.doiStrings?.[0];
  const doiUrl = firstDoi ? `https://doi.org/${firstDoi}` : null;

  return {
    cautionLevel: "medium",
    cautionSummary: firstDoi
      ? "The article includes a DOI citation, so the source is present. This fallback response has not analyzed the DOI target, so restart/check Gemini live mode for source-level assessment."
      : "Some claims in this article are worth a second look.",

    redFlags: firstDoi
      ? []
      : [
          {
            claim: "Statistics are mentioned without a source link.",
            label: "worth checking",
            basis: "No direct link to the original study was found in the article.",
            confidence: "medium"
          },
          {
            claim: "Author background is not disclosed.",
            label: "not enough evidence",
            basis: "The byline does not include credentials or affiliation.",
            confidence: "medium"
          }
        ],

    evidenceTrail: [
      {
        title: "Article extracted",
        summary: `SecondRead extracted the article from ${article.siteName || "this site"}.`,
        label: "verified source present",
        confidence: "high"
      },
      {
        title: "Primary source check",
        summary: firstDoi
          ? `A DOI citation was detected: ${doiUrl}. This confirms that a source citation exists, but this fallback response did not inspect the study content.`
          : "No original study, report, filing, or dataset was confirmed from the extracted text.",
        label: firstDoi ? "source cited but not analyzed" : "source unclear",
        confidence: firstDoi ? "high" : "medium"
      }
    ],

    originalStudyOrReport: {
      detected: Boolean(firstDoi),
      title: null,
      url: doiUrl,
      label: firstDoi ? "study cited but not analyzed" : "original source not found",
      notes: firstDoi
        ? "A source citation is present. The live Gemini analysis needs to inspect the DOI target before SecondRead can say whether the article fairly represents the study."
        : "No original source was found in the article text.",
      confidence: firstDoi ? "high" : "medium"
    },

    statisticalEvidence: {
      summary: "No clear statistical evidence was found in the article.",
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
        "No external author background was checked."
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
      "Compared coverage requires additional sources."
    ],

    readerQuestions: [
      "Does the article link to the original source?",
      "Are the strongest claims supported by named evidence?",
      "What information would change how this should be read?"
    ]
  };
}
