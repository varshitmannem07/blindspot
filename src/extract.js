/*
 * Résumé file → plain text, fully in the browser (no upload, works offline).
 * Supports PDF (pdf.js), Word .docx (mammoth) and plain text.
 */
import * as pdfjs from "pdfjs-dist";
import pdfWorkerCode from "pdfjs-dist/build/pdf.worker.min.js?raw";
import mammoth from "mammoth/mammoth.browser.js";
import { textItemsToLines } from "./lib/pdfText.js";

// The worker is bundled as text and started from a blob URL so the single-file build needs no network.
pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([pdfWorkerCode], { type: "text/javascript" }));

export const ACCEPTED = ".pdf,.docx,.txt";

async function pdfToText(file) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    out.push(...textItemsToLines(items));
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
