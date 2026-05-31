const DOI_REGEX = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;

// Known academic / primary-source domains. A link to any of these counts as a
// cited source even when there is no bare DOI string in the page text.
const SOURCE_HOST_PATTERNS = [
  { kind: "DOI", re: /(^|\.)doi\.org$/i, type: "study" },
  { kind: "BMJ", re: /(^|\.)bmj\.com$/i, type: "study" },
  { kind: "PubMed", re: /(^|\.)ncbi\.nlm\.nih\.gov$/i, type: "study" },
  { kind: "Europe PMC", re: /(^|\.)europepmc\.org$/i, type: "study" },
  { kind: "Nature", re: /(^|\.)nature\.com$/i, type: "study" },
  { kind: "Science", re: /(^|\.)(science\.org|sciencemag\.org)$/i, type: "study" },
  { kind: "The Lancet", re: /(^|\.)thelancet\.com$/i, type: "study" },
  { kind: "NEJM", re: /(^|\.)nejm\.org$/i, type: "study" },
  { kind: "Cell", re: /(^|\.)cell\.com$/i, type: "study" },
  { kind: "JAMA", re: /(^|\.)jamanetwork\.com$/i, type: "study" },
  { kind: "ScienceDirect", re: /(^|\.)sciencedirect\.com$/i, type: "study" },
  { kind: "Springer", re: /(^|\.)(link\.)?springer\.com$/i, type: "study" },
  { kind: "Wiley", re: /(^|\.)wiley\.com$/i, type: "study" },
  { kind: "Taylor & Francis", re: /(^|\.)tandfonline\.com$/i, type: "study" },
  { kind: "PLOS", re: /(^|\.)plos\.org$/i, type: "study" },
  { kind: "arXiv", re: /(^|\.)arxiv\.org$/i, type: "study" },
  { kind: "bioRxiv/medRxiv", re: /(^|\.)(bio|med)rxiv\.org$/i, type: "study" },
  { kind: "Cochrane", re: /(^|\.)cochranelibrary\.com$/i, type: "study" },
  { kind: "Frontiers", re: /(^|\.)frontiersin\.org$/i, type: "study" },
  { kind: "MDPI", re: /(^|\.)mdpi\.com$/i, type: "study" },
  { kind: "Oxford Academic", re: /(^|\.)academic\.oup\.com$/i, type: "study" },
  { kind: "WHO", re: /(^|\.)who\.int$/i, type: "report" },
  { kind: "CDC", re: /(^|\.)cdc\.gov$/i, type: "report" },
  { kind: "NIH", re: /(^|\.)nih\.gov$/i, type: "report" }
];

export function extractSourceMetadata(article = {}) {
  const links = Array.isArray(article.links) ? article.links : [];

  const sourceTexts = [
    article.text,
    article.rawBodyText,
    article.referencesText,
    ...(Array.isArray(article.doiStrings) ? article.doiStrings : []),
    ...links.flatMap((link) => [link.href, link.text])
  ];

  const doiStrings = extractDoiStrings(sourceTexts);
  const sourceLinks = extractSourceLinks(links);

  return {
    doiStrings,
    doiUrls: doiStrings.map((doi) => `https://doi.org/${doi}`),
    sourceLinks,
    referencesText: article.referencesText || ""
  };
}

export function applySourceMetadata(analysis, sourceMetadata) {
  const dois = sourceMetadata.doiStrings || [];
  const sourceLinks = sourceMetadata.sourceLinks || [];

  if (!dois.length && !sourceLinks.length) {
    return analysis;
  }

  const nextAnalysis = { ...analysis };
  const originalSources = Array.isArray(analysis.originalSources)
    ? analysis.originalSources.filter((source) => !isMissingSourceText(sourceText(source)))
    : [];

  const alreadyReferenced = (url) => {
    const needle = url.toLowerCase();
    return originalSources.some((source) => sourceText(source).toLowerCase().includes(needle));
  };

  // DOI citation (kept from before, now phrased as "detected but not analyzed").
  if (dois.length) {
    const doiUrl = sourceMetadata.doiUrls[0];
    if (!alreadyReferenced(dois[0]) && !alreadyReferenced(doiUrl)) {
      originalSources.push(buildDetectedSource(doiUrl, "DOI", "study"));
    }
  }

  // Academic / primary-source links detected by domain (BMJ, PubMed, PDF, ...).
  for (const link of sourceLinks) {
    const bare = link.url.split("#")[0];
    if (alreadyReferenced(bare) || alreadyReferenced(link.url)) {
      continue;
    }
    originalSources.push(buildDetectedSource(link.url, link.kind, link.type));
  }

  nextAnalysis.originalSources = originalSources;
  nextAnalysis.evidenceCheck = removeFalseMissingSourceItems(analysis.evidenceCheck);

  return nextAnalysis;
}

// A source we found in the page but the (Groq) model could not open/verify.
function buildDetectedSource(url, kind, sourceType) {
  return {
    title: "Source detected but not analyzed",
    doiOrUrl: url,
    sourceType: sourceType || "study",
    whatItStudied: "not enough evidence",
    whatItFound: "not enough evidence",
    articleRepresentsFairly: "source inaccessible",
    limitations: [`A ${kind} source link was detected in the article but the current model could not open it to verify it.`],
    confidence: "low"
  };
}

function extractSourceLinks(links) {
  const seen = new Set();
  const out = [];

  for (const link of links) {
    const url = link?.href;
    if (!url) continue;

    const match = classifyLink(url);
    if (!match) continue;

    const key = url.split("#")[0].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({ url, kind: match.kind, type: match.type, text: link.text || "" });
    if (out.length >= 12) break;
  }

  return out;
}

function classifyLink(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  for (const pattern of SOURCE_HOST_PATTERNS) {
    if (pattern.re.test(parsed.hostname)) {
      return { kind: pattern.kind, type: pattern.type };
    }
  }

  if (/\.pdf($|\?)/i.test(parsed.pathname)) {
    return { kind: "PDF", type: "source document" };
  }

  return null;
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

// Every URL the backend should ask the model to actually fetch (DOIs + academic links).
export function sourceUrlsToFetch(sourceMetadata) {
  const urls = [
    ...(sourceMetadata.doiUrls || []),
    ...((sourceMetadata.sourceLinks || []).map((link) => link.url))
  ];
  return Array.from(new Set(urls.filter(Boolean)));
}

// Trust a "yes/partly/no" representation verdict ONLY if the model actually
// retrieved that source (proven by url_context retrieval metadata). Otherwise the
// model is guessing about a source it never opened, so we mark it inaccessible.
export function gateSourceVerification(analysis) {
  const sources = Array.isArray(analysis.originalSources) ? analysis.originalSources : [];
  if (!sources.length) {
    return analysis;
  }

  const retrieved = retrievedUrlSet(analysis.retrievalMetadata);

  const gated = sources.map((source) => {
    const verdict = source.articleRepresentsFairly;
    const claimsVerification = verdict === "yes" || verdict === "partly" || verdict === "no";
    if (!claimsVerification) {
      return source;
    }

    const url = (source.doiOrUrl || "").toString();
    if (url && isRetrieved(url, retrieved)) {
      return source;
    }

    return {
      ...source,
      articleRepresentsFairly: "source inaccessible",
      limitations: appendLimitation(
        source.limitations,
        "The model did not actually retrieve this source, so its representation could not be verified."
      )
    };
  });

  return { ...analysis, originalSources: gated };
}

function retrievedUrlSet(metadata) {
  const set = new Set();
  if (!metadata) {
    return set;
  }

  const list = metadata.url_metadata || metadata.urlMetadata || [];
  (Array.isArray(list) ? list : []).forEach((entry) => {
    const status = entry.url_retrieval_status || entry.urlRetrievalStatus || "";
    const url = entry.retrieved_url || entry.retrievedUrl || "";
    if (url && /success/i.test(status)) {
      set.add(normalizeUrl(url));
    }
  });

  return set;
}

function normalizeUrl(url) {
  return url
    .toString()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, "")
    .replace(/[#?].*$/, "")
    .replace(/\/$/, "");
}

function isRetrieved(url, retrievedSet) {
  if (!retrievedSet.size) {
    return false;
  }

  const needle = normalizeUrl(url);
  if (retrievedSet.has(needle)) {
    return true;
  }

  for (const retrieved of retrievedSet) {
    if (retrieved.includes(needle) || needle.includes(retrieved)) {
      return true;
    }
  }

  return false;
}

function appendLimitation(existing, note) {
  const limitations = Array.isArray(existing) ? existing.slice() : [];
  if (!limitations.some((item) => typeof item === "string" && item.includes("could not be verified"))) {
    limitations.push(note);
  }
  return limitations;
}
