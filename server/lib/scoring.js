// scoring.js
// Turns a SecondRead analysis into a transparent credibility breakdown.
// This is NOT a truth score — it reflects how well-sourced, well-matched and
// transparent the article is, based ONLY on what the analysis surfaced.
//
// Rebuilt for the new schema (quickRead / mainClaims / evidenceCheck /
// originalSources / peopleAndInterests / languageAndFraming). We own the score,
// so each "explanation" is derived directly from the same data that produced it.

// How strongly each main-claim status counts toward support.
const CLAIM_STATUS_WEIGHT = {
  "supported": 1,
  "partly supported": 0.6,
  "unclear": 0.4,
  "overstated": 0.3,
  "unsupported": 0
};

// How well the cited support matches the claim.
const MATCH_WEIGHT = {
  "yes": 1,
  "partly": 0.6,
  "unclear": 0.4,
  "source inaccessible": 0.4,
  "no": 0
};

// Whether the article represents the original source fairly.
const FAIR_WEIGHT = {
  "yes": 1,
  "partly": 0.6,
  "unclear": 0.4,
  "source inaccessible": 0.4,
  "no": 0
};

// Penalties (out of the category max) for interest/conflict signals.
const INTEREST_PENALTY = {
  "possible conflict": 8,
  "conflict declared": 2,
  "funding not found": 2,
  "not enough information": 2,
  "no conflict found": 0,
  "no conflict declared": 0
};

// Penalties for framing/language issues.
const FRAMING_PENALTY = {
  "neutral framing": 0,
  "attributed opinion": 1,
  "unclear": 1,
  "one-sided framing": 3,
  "loaded language": 4,
  "headline overstates body": 4
};

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function average(weights) {
  if (!weights.length) return 0;
  return weights.reduce((sum, w) => sum + w, 0) / weights.length;
}

function tally(items, getKey) {
  const counts = {};
  items.forEach((item) => {
    const key = getKey(item) || "unclear";
    counts[key] = (counts[key] || 0) + 1;
  });
  return Object.entries(counts)
    .map(([key, n]) => `${n} ${key}`)
    .join(", ");
}

function scoreClaimSupport(analysis) {
  const claims = arr(analysis.mainClaims);
  if (!claims.length) {
    return { score: 0, explanation: "No central claims were identified, so claim support could not be assessed (0/30)." };
  }

  const avg = average(claims.map((c) => CLAIM_STATUS_WEIGHT[c.status] ?? 0.4));
  const score = Math.round(avg * 30);

  return {
    score,
    explanation: `Based on ${claims.length} main claim(s) — ${tally(claims, (c) => c.status)}. → ${score}/30.`
  };
}

function scoreEvidenceMatch(analysis) {
  const items = arr(analysis.evidenceCheck);
  if (!items.length) {
    return { score: 0, explanation: "No evidence checks were available, so evidence match could not be assessed (0/25)." };
  }

  const avg = average(items.map((i) => MATCH_WEIGHT[i.sourceMatchesClaim] ?? 0.4));
  const score = Math.round(avg * 25);

  return {
    score,
    explanation: `Across ${items.length} evidence check(s), how well the source matched the claim — ${tally(items, (i) => i.sourceMatchesClaim)}. → ${score}/25.`
  };
}

function scoreSources(analysis) {
  const items = arr(analysis.originalSources);
  if (!items.length) {
    return { score: 0, explanation: "No original study, report, or dataset was identified, so 0/20." };
  }

  const avg = average(items.map((i) => FAIR_WEIGHT[i.articleRepresentsFairly] ?? 0.4));
  const score = Math.round(avg * 20);

  return {
    score,
    explanation: `${items.length} original source(s) found; how fairly the article represents them — ${tally(items, (i) => i.articleRepresentsFairly)}. → ${score}/20.`
  };
}

function scoreInterests(analysis) {
  const items = arr(analysis.peopleAndInterests);
  if (!items.length) {
    return { score: 15, explanation: "No people or interests raised a concern, so the full 15/15." };
  }

  const hits = [];
  let penalty = 0;
  items.forEach((p) => {
    const pen = INTEREST_PENALTY[p.interestOrConflict] ?? 2;
    if (pen) {
      penalty += pen;
      hits.push(p.interestOrConflict);
    }
  });
  const score = Math.max(0, 15 - penalty);

  return {
    score,
    explanation: hits.length
      ? `Interest signals lowered this: ${hits.join(", ")}. → ${score}/15.`
      : "No conflicts of interest surfaced among the people involved, so the full 15/15."
  };
}

function scoreFraming(analysis) {
  const items = arr(analysis.languageAndFraming);
  if (!items.length) {
    return { score: 10, explanation: "No language or framing issues were flagged, so the full 10/10." };
  }

  const hits = [];
  let penalty = 0;
  items.forEach((f) => {
    const pen = FRAMING_PENALTY[f.verdict] ?? 1;
    if (pen) {
      penalty += pen;
      hits.push(f.verdict);
    }
  });
  const score = Math.max(0, 10 - penalty);

  return {
    score,
    explanation: hits.length
      ? `Framing issues lowered this: ${hits.join(", ")}. → ${score}/10.`
      : "Framing read as neutral, so the full 10/10."
  };
}

function levelForTotal(total) {
  if (total >= 80) return "low";
  if (total >= 50) return "medium";
  return "high";
}

export function calculateScore(analysis) {
  const claimSupport = scoreClaimSupport(analysis);
  const evidenceMatch = scoreEvidenceMatch(analysis);
  const sources = scoreSources(analysis);
  const interests = scoreInterests(analysis);
  const framing = scoreFraming(analysis);

  const total =
    claimSupport.score +
    evidenceMatch.score +
    sources.score +
    interests.score +
    framing.score;

  return {
    breakdown: {
      claimSupport: { score: claimSupport.score, outOf: 30, explanation: claimSupport.explanation },
      evidenceMatch: { score: evidenceMatch.score, outOf: 25, explanation: evidenceMatch.explanation },
      sources: { score: sources.score, outOf: 20, explanation: sources.explanation },
      interests: { score: interests.score, outOf: 15, explanation: interests.explanation },
      framing: { score: framing.score, outOf: 10, explanation: framing.explanation }
    },
    total,
    outOf: 100,
    cautionLevel: levelForTotal(total)
  };
}
