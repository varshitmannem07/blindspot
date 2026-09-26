import { describe, expect, it } from "vitest";
import {
  JOBS,
  candidateMeta,
  detectAttributes,
  evaluateRequirements,
  maskAttributes,
  matchJob,
  modelScore,
  runAudit,
  screenResume,
} from "../src/engine.js";
import { SEED } from "../src/data/seed.js";

const seed = (name) => SEED.find((c) => c.text.startsWith(name));
const elena = seed("Elena");
const chloe = seed("Chloe");
const fatima = seed("Fatima");
const job = (c) => JOBS[c.jobId];

describe("legacy ATS screening model", () => {
  it("penalizes Elena for a gender-associated term despite meeting every requirement", () => {
    const s = screenResume(elena.text, job(elena));
    expect(s.score).toBe(1.2);
    expect(s.passed).toBe(false);
    expect(s.reqs.every((r) => r.met)).toBe(true);
    expect(s.attributions).toContainEqual({ f: "extracurricular_affinity_vector", w: -3.7 });
  });

  it("scores Chloe low because requirements are genuinely unmet", () => {
    const s = screenResume(chloe.text, job(chloe));
    expect(s.score).toBe(1.1);
    expect(s.reqs.filter((r) => r.met)).toHaveLength(0);
    expect(s.summary).toMatch(/^Missing required qualifications/);
  });

  it("penalizes Fatima for name and regional origin markers", () => {
    const s = screenResume(fatima.text, job(fatima));
    expect(s.score).toBe(2.1);
    expect(s.rationale).toMatch(/demographic and regional education markers/);
  });

  it("advances the same résumé once the proxy token is removed", () => {
    const edited = elena.text.replace("Women's Coding Society", "Chess Club");
    const s = screenResume(edited, job(elena));
    expect(s.score).toBe(4.9);
    expect(s.passed).toBe(true);
  });
});

describe("BLINDSPOT counterfactual audit", () => {
  it("intercepts the gender penalty on Elena (Δ +3.7)", () => {
    const a = runAudit(elena.text, job(elena));
    expect(a).toMatchObject({ original: 1.2, adjusted: 4.9, delta: 3.7, bias: true });
    expect(a.verdictCode).toBe("SYSTEMIC DEMOGRAPHIC PENALTY INTERCEPTED");
    expect(a.tuple).toBe("(Women's, -3.7 delta)");
    expect(a.variants.find((v) => v.label.startsWith("Swap gendered")).score).toBe(4.9);
  });

  it("upholds Chloe's rejection: Δ +0.1 is below the threshold", () => {
    const a = runAudit(chloe.text, job(chloe));
    expect(a).toMatchObject({ original: 1.1, adjusted: 1.2, delta: 0.1, bias: false, tuple: null });
    expect(a.verdictCode).toBe("NO SYSTEMIC BIAS DETECTED — REJECTION UPHELD");
  });

  it("runs a sensitivity control proving the model does reward merit", () => {
    const control = runAudit(chloe.text, job(chloe)).variants.find((v) => v.control);
    expect(control.score).toBe(4.9);
  });

  it("intercepts the name and origin penalty on Fatima (Δ +2.7)", () => {
    const a = runAudit(fatima.text, job(fatima));
    expect(a).toMatchObject({ original: 2.1, adjusted: 4.8, delta: 2.7, bias: true });
    expect(a.tuple).toBe("(name_origin + regional_origin, -2.7 delta)");
  });

  it("detects name-only bias on a résumé it has never seen", () => {
    const text = `Lakisha Washington
Chicago, IL
B.S. Computer Science, University of Illinois — GPA 3.8
Backend Engineer, Uber (2019–present) — Python microservices, Kafka`;
    const a = runAudit(text, JOBS.backend);
    expect(a.bias).toBe(true);
    expect(a.attrs.find((x) => x.cat === "name").effect).toBe(2.1);
    expect(a.attrs.find((x) => x.kind === "location").effect).toBe(0);
  });

  it("reports no testable attributes when there is nothing to neutralize", () => {
    const a = runAudit("", JOBS.backend);
    expect(a.verdictCode).toBe("NO TESTABLE ATTRIBUTES");
    expect(a.bias).toBe(false);
  });

  it("never changes qualifications when neutralizing", () => {
    for (const c of SEED) {
      const attrs = detectAttributes(c.text);
      const masked = maskAttributes(c.text, attrs, ["gender", "name", "geo"]);
      expect(modelScore(masked, job(c)).merit).toBeCloseTo(modelScore(c.text, job(c)).merit, 10);
    }
  });
});

describe("résumé parsing", () => {
  const reqs = (text, j = JOBS.backend) => Object.fromEntries(evaluateRequirements(text, j).map((r) => [r.id, r]));

  it("sums experience from date ranges, including month names and 'Present'", () => {
    const r = reqs("Name\nEngineer | Acme | Jan 2019 – Present\nIntern | Beta | 2017 - 2019");
    expect(r.years.evidence).toBe("9 years");
  });

  it("does not count education dates as experience", () => {
    const r = reqs("Name\nB.S. Computer Science, State University (2015–2019)");
    expect(r.years.evidence).toBe("Not listed");
  });

  it("reads GPA in either order", () => {
    expect(reqs("Name\nGPA: 3.8").gpa.met).toBe(true);
    expect(reqs("Name\n3.2 GPA").gpa.met).toBe(false);
  });

  it("matches skills on word boundaries only", () => {
    expect(reqs("Name\nStudied employment laws").dist.met).toBe(false);
    expect(reqs("Name\nDeployed on AWS").dist.evidence).toBe("AWS");
  });

  it("finds the location inside a contact line", () => {
    const text = "Priya Raman\npriya@example.com | +91 98450 12345 | Bengaluru, India\nEngineer";
    const loc = detectAttributes(text).find((a) => a.kind === "location");
    expect(loc.text).toBe("Bengaluru, India");
    expect(candidateMeta(text)).toMatchObject({ name: "Priya Raman", initials: "PR", location: "Bengaluru, India" });
  });

  it("ignores a 'Resume' heading above the name", () => {
    expect(candidateMeta("RESUME\nJane Doe\nBoston, MA").name).toBe("Jane Doe");
  });

  it("routes a résumé to the role it fits best", () => {
    expect(matchJob(elena.text)).toBe("backend");
    expect(matchJob(fatima.text)).toBe("cloud");
  });
});
