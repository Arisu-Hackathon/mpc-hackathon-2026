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
  const sourceNotes = analysis.originalStudyOrReport?.notes;
  const doiNotes = `The article cites a source by DOI (${doi}). Treat this as a source citation. If the DOI page or study text was accessible, analyze whether the article accurately represents it; if it was not accessible, label the source as cited but inaccessible.`;
  const nextAnalysis = {
    ...analysis,
    originalStudyOrReport: {
      ...(analysis.originalStudyOrReport || {}),
      detected: true,
      title: analysis.originalStudyOrReport?.title || null,
      url: analysis.originalStudyOrReport?.url || doiUrl,
      notes: isMissingSourceText(sourceNotes) ? doiNotes : sourceNotes || doiNotes
    }
  };

  nextAnalysis.redFlags = removeFalseMissingSourceFlags(analysis.redFlags);
  nextAnalysis.evidenceTrail = addDoiEvidenceTrail(analysis.evidenceTrail, doi, doiUrl);

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

function removeFalseMissingSourceFlags(redFlags) {
  if (!Array.isArray(redFlags)) {
    return [];
  }

  return redFlags.filter((flag) => {
    const text = `${flag?.claim || ""} ${flag?.basis || ""}`.toLowerCase();
    return !isMissingSourceText(text);
  });
}

function addDoiEvidenceTrail(evidenceTrail, doi, doiUrl) {
  const items = Array.isArray(evidenceTrail)
    ? evidenceTrail.filter((item) => !isMissingSourceText(`${item?.title || ""} ${item?.summary || ""}`))
    : [];
  const hasDoiItem = items.some((item) => {
    const text = `${item?.title || ""} ${item?.summary || ""}`.toLowerCase();
    return text.includes(doi.toLowerCase()) || text.includes(doiUrl.toLowerCase());
  });

  if (hasDoiItem) {
    return items;
  }

  return [
    ...items,
    {
      title: "Original study citation",
      summary: `The article cites a DOI: ${doiUrl}. A DOI counts as a source citation; SecondRead should analyze the DOI target when it is accessible.`
    }
  ];
}

function isMissingSourceText(text = "") {
  return /(no|without|missing|not found|not detected|not confirmed).{0,60}(source|study|citation|doi|link|reference|report|dataset)/i.test(text);
}
