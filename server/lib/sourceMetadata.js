const DOI_REGEX = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

export function extractSourceMetadata(article = {}) {
  const sourceTexts = [
    article.text,
    article.rawBodyText,
    article.referencesText,
    ...(Array.isArray(article.doiStrings) ? article.doiStrings : []),
    ...(Array.isArray(article.links)
      ? article.links.flatMap((link) => [link.href, link.text])
      : [])
  ];

  const doiStrings = extractDoiStrings(sourceTexts);

  return {
    doiStrings,
    doiUrls: doiStrings.map((doi) => `https://doi.org/${doi}`),
    referencesText: article.referencesText || ""
  };
}

export function applySourceMetadata(analysis, sourceMetadata) {
  if (!sourceMetadata.doiStrings.length) {
    return analysis;
  }

  const doi = sourceMetadata.doiStrings[0];
  const doiUrl = sourceMetadata.doiUrls[0];
  const nextAnalysis = { ...analysis };
  const originalSources = Array.isArray(analysis.originalSources)
    ? analysis.originalSources.filter((source) => !isMissingSourceText(sourceText(source)))
    : [];

  const hasDoiSource = originalSources.some((source) =>
    sourceText(source).toLowerCase().includes(doi.toLowerCase()) ||
    sourceText(source).toLowerCase().includes(doiUrl.toLowerCase())
  );

  if (!hasDoiSource) {
    originalSources.push({
      title: "not enough evidence",
      doiOrUrl: doiUrl,
      sourceType: "study",
      whatItStudied: "not enough evidence",
      whatItFound: "not enough evidence",
      articleRepresentsFairly: "unclear",
      limitations: [
        "SecondRead detected a DOI citation. If live source retrieval was unavailable, the study content still needs to be checked."
      ],
      confidence: "high"
    });
  }

  nextAnalysis.originalSources = originalSources;
  nextAnalysis.evidenceCheck = removeFalseMissingSourceItems(analysis.evidenceCheck);

  return nextAnalysis;
}

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

function removeFalseMissingSourceItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => {
    const text = sourceText(item).toLowerCase();
    return !isMissingSourceText(text);
  });
}

function sourceText(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  return Object.values(value)
    .flat()
    .filter(Boolean)
    .join(" ");
}

function isMissingSourceText(text = "") {
  return /((\bno\b|\bwithout\b|\bmissing\b|\bnot found\b|\bnot detected\b|\bnot confirmed\b).{0,60}(source|study|citation|doi|link|reference|report|dataset))|((source|study|citation|doi|link|reference|report|dataset).{0,60}(\bmissing\b|\bnot found\b|\bnot detected\b|\bnot confirmed\b))/i.test(text);
}
