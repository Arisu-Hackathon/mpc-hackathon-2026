// scoring.js
// Turns a SecondRead analysis object into a transparent credibility breakdown.
// This is NOT a truth score — it reflects how well-sourced and self-disclosed
// an article is, based only on what the analysis surfaced.
//
// We own the score, so we also own the justification: every "explanation" below
// is derived directly from the same data the score was computed from. Nothing is
// invented — the explanation only restates what produced the number.

const RED_FLAG_PENALTIES = {
  "worth checking": 5,
  "methodology unclear": 8,
  "not enough evidence": 6,
  "possible conflict": 10
};

const FUNDING_KEYWORDS = ["conflict", "funded by", "sponsored"];

function scoreRedFlags(analysis) {
  const flags = Array.isArray(analysis.redFlags) ? analysis.redFlags : [];
  let score = 30;
  const applied = [];

  for (const flag of flags) {
    const penalty = RED_FLAG_PENALTIES[flag?.label];
    if (penalty) {
      score -= penalty;
      applied.push({ label: flag.label, penalty });
    }
  }

  score = Math.max(0, score);

  let explanation;
  if (applied.length === 0) {
    explanation = flags.length
      ? `Started at 30/30. None of the ${flags.length} flagged item(s) carried a penalty, so the full 30/30.`
      : "Started at 30/30. No claims were flagged, so the full 30/30.";
  } else {
    const list = applied.map((a) => `"${a.label}" (−${a.penalty})`).join(", ");
    explanation =
      `Started at 30/30. ${applied.length} of ${flags.length} flagged item(s) lowered it: ` +
      `${list}. See "Red flags" below for each claim.`;
  }

  return { score, explanation };
}

function scoreOriginalSource(analysis) {
  const detected = Boolean(analysis.originalStudyOrReport?.detected);

  return {
    score: detected ? 20 : 0,
    explanation: detected
      ? "An original study or report was detected in the article, so the full 20/20."
      : "No original study or report was detected in the article, so 0/20."
  };
}

function scoreAuthor(analysis) {
  const name = analysis.authorBackground?.name;

  return {
    score: name ? 15 : 0,
    explanation: name
      ? `An author was identified (${name}), so the full 15/15.`
      : "No author could be identified from the article, so 0/15."
  };
}

function scoreStatisticalEvidence(analysis) {
  const stats = analysis.statisticalEvidence || {};
  let score = 0;
  const bits = [];

  if (stats.summary && stats.summary.length > 30) {
    score += 10;
    bits.push("a statistical summary was present (+10)");
  } else {
    bits.push("no usable statistical summary (+0)");
  }

  if (stats.sampleSize) {
    score += 5;
    bits.push("a sample size was given (+5)");
  } else {
    bits.push("no sample size (+0)");
  }

  if (stats.effectSize) {
    score += 5;
    bits.push("an effect size was given (+5)");
  } else {
    bits.push("no effect size (+0)");
  }

  return {
    score,
    explanation: `Scored from three parts: ${bits.join("; ")}. → ${score}/20.`
  };
}

function scoreFundingAndConflicts(analysis) {
  const notes = Array.isArray(analysis.fundingAndConflicts)
    ? analysis.fundingAndConflicts
    : [];

  const hasFlag = notes.some((note) => {
    if (typeof note !== "string") return false;
    const lower = note.toLowerCase();
    return FUNDING_KEYWORDS.some((keyword) => lower.includes(keyword));
  });

  return {
    score: hasFlag ? 0 : 15,
    explanation: hasFlag
      ? "A funding or conflict-of-interest signal was found in the article, so 0/15."
      : "No funding or conflict-of-interest concerns were found in the article, so the full 15/15."
  };
}

function levelForTotal(total) {
  if (total >= 80) return "low";
  if (total >= 50) return "medium";
  return "high";
}

export function calculateScore(analysis) {
  const redFlags = scoreRedFlags(analysis);
  const originalSource = scoreOriginalSource(analysis);
  const author = scoreAuthor(analysis);
  const statisticalEvidence = scoreStatisticalEvidence(analysis);
  const fundingAndConflicts = scoreFundingAndConflicts(analysis);

  const total =
    redFlags.score +
    originalSource.score +
    author.score +
    statisticalEvidence.score +
    fundingAndConflicts.score;

  return {
    breakdown: {
      redFlags: { score: redFlags.score, outOf: 30, explanation: redFlags.explanation },
      originalSource: {
        score: originalSource.score,
        outOf: 20,
        explanation: originalSource.explanation
      },
      author: { score: author.score, outOf: 15, explanation: author.explanation },
      statisticalEvidence: {
        score: statisticalEvidence.score,
        outOf: 20,
        explanation: statisticalEvidence.explanation
      },
      fundingAndConflicts: {
        score: fundingAndConflicts.score,
        outOf: 15,
        explanation: fundingAndConflicts.explanation
      }
    },
    total,
    outOf: 100,
    cautionLevel: levelForTotal(total)
  };
}
