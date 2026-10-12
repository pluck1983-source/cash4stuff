/**
 * Reads the text on a photo, on the phone itself. The reader (about 8 MB,
 * from the app's own ocr/ folder) downloads the first time it's used, so it
 * needs a connection then; after that it's kept for offline use.
 */
export async function readText(image: Blob, onProgress?: (share: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const base = `${import.meta.env.BASE_URL}ocr`;
  const worker = await createWorker('eng', 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: base,
    langPath: base,
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
