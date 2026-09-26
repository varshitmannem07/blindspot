/**
 * End-to-end check of every file in sample-resumes/: real PDF, Word and text extraction,
 * automatic role matching, screening and audit. Keeps the README's results table honest.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { JOBS, candidateMeta, matchJob, runAudit, screenResume } from "../src/engine.js";
import { textItemsToLines } from "../src/lib/pdfText.js";

const DIR = path.resolve(__dirname, "../sample-resumes");

async function readResume(file) {
  const full = path.join(DIR, file);
  if (file.endsWith(".txt")) return fs.readFileSync(full, "utf8");
  if (file.endsWith(".docx")) return (await mammoth.extractRawText({ path: full })).value;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(full)), verbosity: 0 }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    lines.push(...textItemsToLines((await (await pdf.getPage(p)).getTextContent()).items));
  }
  return lines.join("\n");
}

const EXPECTED = [
  {
    file: "1_Priya_Raman_Cloud_Architect.pdf",
    name: "Priya Raman",
    job: "cloud",
    original: 2.1,
    adjusted: 4.9,
    bias: true,
  },
  {
    file: "2_Jamal_Washington_Backend.pdf",
    name: "Jamal Washington",
    job: "backend",
    original: 2.8,
    adjusted: 4.9,
    bias: true,
  },
  {
    file: "3_Sarah_Mitchell_Backend.docx",
    name: "Sarah Mitchell",
    job: "backend",
    original: 2.6,
    adjusted: 4.9,
    bias: true,
  },
  {
    file: "4_Daniel_Brooks_Backend.pdf",
    name: "Daniel Brooks",
    job: "backend",
    original: 4.9,
    adjusted: 4.9,
    bias: false,
    passed: true,
  },
  {
    file: "5_Kevin_Park_Backend.txt",
    name: "Kevin Park",
    job: "backend",
    original: 1.4,
    adjusted: 1.4,
    bias: false,
    passed: false,
  },
];

describe("sample résumés", () => {
  it("covers every file in the folder", () => {
    expect(fs.readdirSync(DIR).sort()).toEqual(EXPECTED.map((e) => e.file).sort());
  });

  it.each(EXPECTED)("$file → bias=$bias ($original → $adjusted)", async (e) => {
    const text = await readResume(e.file);
    expect(candidateMeta(text).name).toBe(e.name);
    const jobId = matchJob(text);
    expect(jobId).toBe(e.job);
    const audit = runAudit(text, JOBS[jobId]);
    expect(audit).toMatchObject({ original: e.original, adjusted: e.adjusted, bias: e.bias });
    if (e.passed !== undefined) expect(screenResume(text, JOBS[jobId]).passed).toBe(e.passed);
  });
});
