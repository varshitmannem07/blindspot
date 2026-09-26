/*
 * Résumé file → plain text, fully in the browser (no upload, works offline).
 * Supports PDF (pdf.js), Word .docx (mammoth) and plain text.
 */
import * as pdfjs from "pdfjs-dist";
import pdfWorkerCode from "pdfjs-dist/build/pdf.worker.min.js?raw";
import mammoth from "mammoth/mammoth.browser.js";

// The worker is bundled as text and started from a blob URL so the single-file build needs no network.
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([pdfWorkerCode], { type: "text/javascript" }));

export const ACCEPTED = ".pdf,.docx,.txt";

async function pdfToText(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    // Group text fragments into visual lines by their baseline, then order each line left to right.
    const rows = [];
    for (const it of items) {
      if (!it.str || !it.str.trim()) continue;
      const [x, y] = [it.transform[4], it.transform[5]];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str });
    }
    rows
      .sort((a, b) => b.y - a.y)
      .forEach((r) => out.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(" ")));
  }
  return out.join("\n");
}

export async function extractText(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  if (ext === "pdf") return pdfToText(file);
  if (ext === "docx") return (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  if (ext === "txt") return file.text();
  throw new Error(`“${file.name}” is not supported. Upload a PDF, Word (.docx) or text file.`);
}
