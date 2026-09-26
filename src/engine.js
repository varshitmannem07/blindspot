/*
 * BLINDSPOT scoring + audit engine.
 *
 * Two independent parts:
 *  1. `modelScore` — a simulated legacy ATS ("TalentRank"). It scores real résumé text
 *     against role requirements, but, like models trained on historical hiring data, it
 *     has learned penalties for tokens that act as proxies for gender and national origin.
 *  2. `runAudit` — BLINDSPOT. It treats the ATS as a black box: it detects personal
 *     attributes with its own (broader) detector, masks or swaps them, re-queries the
 *     model, and flags any score change above THRESHOLD.
 */

export const THRESHOLD = 1.5;
const CURRENT_YEAR = 2026;
const MAX_SCORE = 4.9;
const PASS_SCORE = 3.0;

export const r1 = (n) => Math.round(n * 10) / 10;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const toLines = (text) =>
  text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !/^(résumé|resume|curriculum vitae|cv)$/i.test(l));

/* ------------------------------------------------------------------ */
/*  Roles                                                              */
/* ------------------------------------------------------------------ */

export const JOBS = {
  backend: {
    id: "backend",
    title: "Staff Backend Engineer",
    req: "REQ-2291",
    requirements: [
      { id: "years", label: "5+ years experience", type: "years", min: 5 },
      { id: "python", label: "Python", type: "skill", terms: ["python", "django", "flask", "fastapi"] },
      {
        id: "dist",
        label: "Distributed systems",
        type: "skill",
        terms: ["kafka", "distributed", "microservices", "event bus", "cassandra", "aws", "kubernetes"],
      },
      { id: "gpa", label: "GPA above 3.5", type: "gpa", min: 3.5 },
    ],
  },
  cloud: {
    id: "cloud",
    title: "Senior Cloud Architect",
    req: "REQ-2307",
    requirements: [
      { id: "k8s", label: "Kubernetes", type: "skill", terms: ["kubernetes", "k8s", "cka"] },
      { id: "go", label: "Go", type: "skill", terms: ["golang", "go"] },
      { id: "tf", label: "Terraform", type: "skill", terms: ["terraform"] },
      { id: "years", label: "7+ years experience", type: "years", min: 7 },
    ],
  },
};

/* ------------------------------------------------------------------ */
/*  Résumé parsing                                                     */
/* ------------------------------------------------------------------ */

const EDUCATION =
  /(university|college|school|academy|institute|bachelor|master|ph\.?d|bootcamp|certificate|diploma|gpa|\bb\.s\.|\bm\.s\.|\bb\.?tech|\bm\.?tech|\bb\.?sc|\bm\.?sc)/i;
const MONTH = "(?:[A-Za-z]{3,9}\\.?\\s+|\\d{1,2}\\/)?";
const DATE_RANGE = new RegExp(`\\b${MONTH}((?:19|20)\\d{2})\\s*(?:[–—-]|to)\\s*${MONTH}((?:19|20)\\d{2}|present|now|current)\\b`, "gi");

function parseYears(lines) {
  let total = 0;
  let explicit = 0;
  lines.slice(1).forEach((line) => {
    if (EDUCATION.test(line)) return;
    for (const m of line.matchAll(DATE_RANGE)) {
      const start = +m[1];
      const end = /\d/.test(m[2]) ? +m[2] : CURRENT_YEAR;
      if (end >= start) total += end - start;
    }
    for (const m of line.matchAll(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\b/gi)) explicit = Math.max(explicit, +m[1]);
  });
  return Math.max(total, explicit);
}

function parseGpa(text) {
  const m = text.match(/gpa[\s:]*([0-4](?:\.\d{1,2})?)/i) || text.match(/\b([0-4]\.\d{1,2})\s*gpa/i);
  return m ? parseFloat(m[1]) : null;
}

const TERM_DISPLAY = { aws: "AWS", k8s: "K8s", cka: "CKA", go: "Go", fastapi: "FastAPI" };

export function evaluateRequirements(text, job) {
  const lines = toLines(text);
  const years = parseYears(lines);
  const gpa = parseGpa(text);
  return job.requirements.map((r) => {
    if (r.type === "years") {
      const credit = Math.min(1, years / r.min);
      return { ...r, credit, met: credit >= 1, evidence: years ? `${years} year${years === 1 ? "" : "s"}` : "Not listed" };
    }
    if (r.type === "gpa") {
      const credit = gpa != null && gpa >= r.min ? 1 : 0;
      return { ...r, credit, met: credit === 1, evidence: gpa == null ? "Not listed" : gpa.toFixed(1) };
    }
    const hit = r.terms.find((t) => new RegExp(`\\b${esc(t)}\\b`, "i").test(text));
    return { ...r, credit: hit ? 1 : 0, met: !!hit, evidence: hit ? TERM_DISPLAY[hit] || cap(hit) : "Not listed" };
  });
}

/* ------------------------------------------------------------------ */
/*  1. Simulated legacy ATS with learned proxy penalties               */
/* ------------------------------------------------------------------ */

const NAME_TOKENS =
  /\b(fatima|fatimah|mohammed|mohammad|muhammad|ahmed|ahmad|aisha|ayesha|omar|hassan|hussein|khalid|yusuf|priya|rajesh|deepak|lakshmi|oluwaseun|chinedu|ngozi|kwame|adebayo|nguyen|xiaoming|jamal|lakisha|darnell|tyrone|keisha)\b/i;
const REGIONS =
  /\b(uae|dubai|abu dhabi|al ain|sharjah|saudi|riyadh|jeddah|qatar|doha|oman|kuwait|pakistan|karachi|lahore|islamabad|india|mumbai|delhi|bangalore|bengaluru|chennai|hyderabad|nigeria|lagos|abuja|ghana|accra|kenya|nairobi|egypt|cairo|bangladesh|dhaka|philippines|manila)\b/i;

const LEARNED_PENALTIES = {
  gender: {
    feature: "extracurricular_affinity_vector",
    scope: "body",
    rules: [
      [/\bwomen['’]s\b/i, 0.95],
      [/\bwom[ae]n\b/i, 0.5],
      [/\bfemale\b/i, 0.5],
      [/\bgirls?\b/i, 0.6],
      [/\bsorority\b/i, 0.45],
      [/\bladies\b/i, 0.45],
    ],
  },
  name: {
    feature: "name_embedding_affinity",
    scope: "name",
    rules: [
      [/\b(al|el)-\w/i, 0.55],
      [/\b(bin|ibn|abu|abd|abdul)\b/i, 0.55],
      [NAME_TOKENS, 0.55],
    ],
  },
  geo: { feature: "regional_education_prior", scope: "body", rules: [[REGIONS, 0.35]] },
};

function combine(merit, penalties) {
  const affinity = Object.values(penalties).reduce((a, p) => a * (1 - p), 1);
  return 1 + (merit - 1) * affinity;
}

export function modelScore(text, job) {
  const lines = toLines(text);
  const reqs = evaluateRequirements(text, job);
  const fraction = reqs.reduce((s, r) => s + r.credit, 0) / reqs.length;
  const merit = 1 + (MAX_SCORE - 1) * fraction;
  const penalties = {};
  for (const [cat, def] of Object.entries(LEARNED_PENALTIES)) {
    const scoped = def.scope === "name" ? lines[0] || "" : lines.slice(1).join("\n");
    penalties[cat] = def.rules.reduce((p, [re, w]) => (re.test(scoped) ? Math.max(p, w) : p), 0);
  }
  return { score: combine(merit, penalties), merit, fraction, penalties, reqs };
}

/** What the ATS shows the recruiter: score, outcome, and its own explanation. */
export function screenResume(text, job) {
  const m = modelScore(text, job);
  const score = r1(m.score);
  const passed = score >= PASS_SCORE;

  const attributions = [{ f: "core_skill_alignment", w: r1(m.merit - 1) }];
  let dominant = null;
  let dominantLoss = 0;
  for (const [cat, p] of Object.entries(m.penalties)) {
    if (!p) continue;
    const loss = combine(m.merit, { ...m.penalties, [cat]: 0 }) - m.score;
    attributions.push({ f: LEARNED_PENALTIES[cat].feature, w: -r1(loss) });
    if (loss > dominantLoss) [dominant, dominantLoss] = [cat, loss];
  }
  const gap = MAX_SCORE - m.merit;
  if (gap > 0.05) attributions.push({ f: "requirement_gap", w: -r1(gap) });

  const missing = m.reqs.filter((r) => !r.met);
  const penaltyLoss = m.merit - m.score;
  let rationale;
  let summary;
  if (passed) {
    rationale = "Profile aligns with historical high-performer benchmark vectors.";
    summary = "Strong match with role requirements.";
  } else if (penaltyLoss > gap && dominant === "gender") {
    rationale =
      "Extracurricular tenure and institutional affiliations diverge significantly from historical high-performer benchmark vectors.";
    summary = "Background does not match the profile of previous successful hires.";
  } else if (penaltyLoss > gap) {
    rationale = "Low historical affinity match across demographic and regional education markers.";
    summary = "Low similarity to previous hires based on demographic and regional education factors.";
  } else {
    const skills = missing.filter((r) => r.type === "skill").map((r) => r.label.toLowerCase());
    const tenure = missing.some((r) => r.type === "years");
    rationale = `Severe deficit in required ${skills.length ? skills.join(" and ") : "qualifications"}${
      tenure ? " and insufficient engineering tenure" : ""
    }.`;
    summary = `Missing required qualifications: ${missing.map((r) => r.label).join(", ")}.`;
  }

  return { score, passed, rationale, summary, attributions, reqs: m.reqs };
}

/* ------------------------------------------------------------------ */
/*  2. BLINDSPOT black-box audit                                       */
/* ------------------------------------------------------------------ */

const CAT_ORDER = ["gender", "name", "geo"];
const GENDER_TERMS =
  /\b(women in (?:tech|engineering|stem|computing|science)|women['’]s|women|woman|female|girls?|sorority|ladies|men['’]s|fraternity|maternity|mothers?)\b/gi;
const LOCATION_LINE = /^[A-Z][A-Za-z .'-]+,\s*[A-Za-z][A-Za-z .]+$/;
const SCHOOL_LINE = /\b(high school|secondary|model school|school)\b/i;
const MASK = { name: "Candidate", location: "[LOCATION]", school: "[SCHOOL]", term: "[TERM]" };

/** Location in the header: a "City, Region" line or segment of a contact line ("a@b.com | 555-0100 | City, ST"). */
function findLocation(lines) {
  for (let i = 1; i < Math.min(lines.length, 5); i++) {
    for (const m of lines[i].matchAll(/[^|·•]+/g)) {
      const seg = m[0].trim();
      if (LOCATION_LINE.test(seg) && !/[@\d]/.test(seg)) {
        const start = m.index + m[0].indexOf(seg);
        return { line: i, start, end: start + seg.length, text: seg };
      }
    }
  }
  return null;
}

/** Find personal attributes in the résumé: {cat, kind, line, start, end, text, label}. */
export function detectAttributes(text) {
  const lines = toLines(text);
  const found = [];
  if (lines[0]) found.push({ cat: "name", kind: "name", line: 0, start: 0, end: lines[0].length, text: lines[0], label: "Name" });
  const loc = findLocation(lines);
  if (loc) found.push({ cat: "geo", kind: "location", ...loc, label: "Location" });
  lines.forEach((line, i) => {
    if (i === 0) return;
    if (loc && i === loc.line && loc.start === 0 && loc.end === line.length) return;
    if (SCHOOL_LINE.test(line) && !/(university|college)/i.test(line)) {
      found.push({ cat: "geo", kind: "school", line: i, start: 0, end: line.length, text: line, label: "Secondary school" });
      return;
    }
    for (const m of line.matchAll(GENDER_TERMS)) {
      found.push({
        cat: "gender",
        kind: "term",
        line: i,
        start: m.index,
        end: m.index + m[0].length,
        text: m[0],
        label: "Gender-associated term",
      });
    }
  });
  return found;
}

function applyToLines(text, fn) {
  return toLines(text)
    .map((line, i) => fn(line, i))
    .join("\n");
}

export function maskAttributes(text, attrs, cats) {
  const chosen = attrs.filter((a) => cats.includes(a.cat));
  return applyToLines(text, (line, i) => {
    let out = line;
    chosen
      .filter((a) => a.line === i)
      .sort((a, b) => b.start - a.start)
      .forEach((a) => (out = out.slice(0, a.start) + MASK[a.kind] + out.slice(a.end)));
    return out;
  });
}

const GENDER_SWAPS = [
  [/\bwomen['’]s\b/gi, "men's"],
  [/\bwomen\b/gi, "men"],
  [/\bwoman\b/gi, "man"],
  [/\bfemale\b/gi, "male"],
  [/\bgirls\b/gi, "boys"],
  [/\bgirl\b/gi, "boy"],
  [/\bsorority\b/gi, "fraternity"],
  [/\bladies\b/gi, "gentlemen"],
];

function swapGender(text) {
  return applyToLines(text, (line, i) =>
    i === 0 ? line : GENDER_SWAPS.reduce((l, [re, to]) => l.replace(re, (m) => (m[0] === m[0].toUpperCase() ? cap(to) : to)), line)
  );
}

function augmentMissing(missing) {
  return missing
    .map((r) =>
      r.type === "years" ? `${r.min} years experience` : r.type === "gpa" ? `GPA ${(r.min + 0.3).toFixed(1)}` : `Skills: ${r.terms[0]}`
    )
    .join("\n");
}

const CAT_PHRASE = { gender: "gender-associated terms", name: "name", geo: "location and schooling" };
const TUPLE_LABEL = { name: "name_origin", geo: "regional_origin" };

export function runAudit(text, job) {
  const attrs = detectAttributes(text);
  const base = modelScore(text, job);
  const original = r1(base.score);
  const cats = CAT_ORDER.filter((c) => attrs.some((a) => a.cat === c));

  const variants = [{ label: "Original résumé", score: original, base: true }];
  const effect = {};
  for (const cat of cats) {
    const s = r1(modelScore(maskAttributes(text, attrs, [cat]), job).score);
    effect[cat] = r1(s - original);
    variants.push({ label: `Neutralize ${CAT_PHRASE[cat]}`, score: s });
  }
  if (cats.includes("gender")) variants.push({ label: "Swap gendered terms (e.g. women's → men's)", score: r1(modelScore(swapGender(text), job).score) });
  if (cats.includes("name")) {
    const swapped = applyToLines(text, (l, i) => (i === 0 ? "Alex Morgan" : l));
    variants.push({ label: "Swap name → “Alex Morgan”", score: r1(modelScore(swapped, job).score) });
  }

  const neutralText = maskAttributes(text, attrs, cats);
  const adjusted = r1(modelScore(neutralText, job).score);
  if (cats.length > 1) variants.push({ label: "Neutralize all personal attributes", score: adjusted });

  const missing = base.reqs.filter((r) => !r.met);
  if (missing.length) {
    variants.push({
      label: "Add missing requirements (sensitivity check)",
      score: r1(modelScore(`${neutralText}\n${augmentMissing(missing)}`, job).score),
      control: true,
    });
  }

  const delta = r1(adjusted - original);
  const bias = delta >= THRESHOLD;
  const drivers = cats.filter((c) => effect[c] >= 0.1).sort((a, b) => effect[b] - effect[a]);
  const genderTokens = [...new Set(attrs.filter((a) => a.cat === "gender").map((a) => a.text))];

  const geoKinds = new Set(attrs.filter((a) => a.cat === "geo").map((a) => a.kind));
  const describe = (list) => {
    const parts = list.flatMap((c) =>
      c === "gender"
        ? genderTokens.map((t) => `“${t}”`)
        : c === "name"
        ? ["the candidate's name"]
        : [geoKinds.has("location") && "location", geoKinds.has("school") && "secondary school"].filter(Boolean)
    );
    return parts.length < 3 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  };
  const CAUSE = { gender: "a gender-associated term", name: "the candidate's name", geo: "location and schooling" };

  let finding;
  let verdictCode;
  if (!cats.length) {
    finding = "No personal attributes such as name, location, or gender-associated terms were found to test.";
    verdictCode = "NO TESTABLE ATTRIBUTES";
  } else if (bias) {
    const origin = drivers.every((c) => c !== "gender");
    const cause =
      drivers.length === 1 ? CAUSE[drivers[0]] : origin ? "name and regional origin indicators" : "personal attributes";
    finding = `Neutralizing ${describe(drivers)} raised the score from ${original.toFixed(1)} to ${adjusted.toFixed(
      1
    )} with no change to qualifications. The original score was driven by ${cause}, not by qualifications.`;
    verdictCode = drivers[0] === "gender" ? "SYSTEMIC DEMOGRAPHIC PENALTY INTERCEPTED" : "NAME / GEO PROXY PENALTY INTERCEPTED";
  } else {
    const passed = original >= PASS_SCORE;
    finding = `Neutralizing ${describe(cats)} ${delta === 0 ? "did not change the score" : `changed the score by only ${Math.abs(delta).toFixed(1)}`}. ${
      passed ? "The score is not driven by personal attributes." : "The low score reflects unmet role requirements, not personal attributes."
    }`;
    verdictCode = passed ? "NO SYSTEMIC BIAS DETECTED" : "NO SYSTEMIC BIAS DETECTED — REJECTION UPHELD";
  }

  const tuple = bias
    ? `(${drivers.map((c) => (c === "gender" ? genderTokens.join(", ") : TUPLE_LABEL[c])).join(" + ")}, -${delta.toFixed(1)} delta)`
    : null;

  return {
    attrs: attrs.map((a) => ({ ...a, effect: effect[a.cat] })),
    cats,
    original,
    adjusted,
    delta,
    bias,
    finding,
    verdictCode,
    tuple,
    variants,
    reqs: base.reqs,
  };
}

/** Name, initials and location pulled from the first two résumé lines. */
export function candidateMeta(text) {
  const lines = toLines(text);
  const name = lines[0] || "Unnamed candidate";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
  const location = findLocation(lines)?.text || "";
  return { name, first: name.split(/\s+/)[0], initials, location };
}

/** Pick the open role whose requirements the résumé matches best. */
export function matchJob(text) {
  let best = null;
  for (const job of Object.values(JOBS)) {
    const reqs = evaluateRequirements(text, job);
    const fit = reqs.reduce((s, r) => s + r.credit, 0) / reqs.length;
    if (!best || fit > best.fit) best = { id: job.id, fit };
  }
  return best.id;
}
