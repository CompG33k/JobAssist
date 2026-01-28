import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";

// Configure PDF.js worker for Vite + extension
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

function readAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(r.result);
    r.readAsArrayBuffer(file);
  });
}

function readAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Failed to read file"));
    r.onload = () => resolve(String(r.result || ""));
    r.readAsText(file);
  });
}

async function extractPdfText(file) {
  const buf = await readAsArrayBuffer(file);
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  let out = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map((it) => (it && it.str ? it.str : "")).filter(Boolean);
    out.push(strings.join(" "));
  }
  return out.join("\n");
}

async function extractDocxText(file) {
  const buf = await readAsArrayBuffer(file);
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return (res && res.value ? res.value : "").trim();
}

export async function extractTextFromFile(file) {
  const name = (file && file.name ? file.name : "").toLowerCase();
  const type = (file && file.type ? file.type : "").toLowerCase();

  if (name.endsWith(".pdf") || type.includes("pdf")) {
    const t = await extractPdfText(file);
    if (!t.trim()) throw new Error("Could not extract text from PDF.");
    return t;
  }

  if (name.endsWith(".docx") || type.includes("officedocument.wordprocessingml.document")) {
    const t = await extractDocxText(file);
    if (!t.trim()) throw new Error("Could not extract text from DOCX.");
    return t;
  }

  // fallback plain text
  const t = await readAsText(file);
  if (!t.trim()) throw new Error("File looks empty.");
  return t;
}
