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