import { compressImage } from './photos';

/**
 * Evidence for costs: receipts, invoices, Marketplace listing and chat
 * screenshots, proof of payment. Kept in the same store (and Drive folder) as
 * item photos, but saved at a higher resolution so the text in a screenshot
 * stays readable, and PDFs are kept exactly as they are.
 */

/** Screenshots are tall; 2400 px keeps chat text legible where 1200 px doesn't */
const EVIDENCE_MAX_EDGE = 2400;
/** Biggest PDF accepted - Drive takes more, but this keeps sync quick on a phone */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export async function isPdf(blob: Blob): Promise<boolean> {
  if (blob.type === 'application/pdf') return true;
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

/** File extension for an evidence file, from its contents rather than its name */
export async function evidenceExtension(blob: Blob): Promise<'pdf' | 'png' | 'jpg'> {
  if (await isPdf(blob)) return 'pdf';
  const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  return head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 ? 'png' : 'jpg';
}

/** Gets a picked file ready to store: PDFs as they are, images shrunk but readable */
export async function prepareEvidence(file: File): Promise<Blob> {
  if (await isPdf(file)) {
    if (file.size > MAX_PDF_BYTES) throw new Error(`${file.name} is over ${MAX_PDF_BYTES / 1024 / 1024} MB - save a smaller copy or a screenshot of it`);
    return file.type === 'application/pdf' ? file : new Blob([file], { type: 'application/pdf' });
  }
  return compressImage(file, EVIDENCE_MAX_EDGE);
}

/**
 * HMRC: a sole trader keeps business records for at least 5 years after the
 * 31 January filing deadline for the tax year they belong to. A cost paid on
 * 10 Nov 2026 is in 2026-27, filed by 31 Jan 2028, so kept until 31 Jan 2033.
 */
export function retainUntil(dateIso: string): string {
  const [y, m, d] = dateIso.split('-').map(Number);
  const taxYearStart = m > 4 || (m === 4 && d >= 6) ? y : y - 1;
  return `${taxYearStart + 2 + 5}-01-31`;
}

export function mustKeep(dateIso: string, today: string): boolean {
  return today <= retainUntil(dateIso);
}
