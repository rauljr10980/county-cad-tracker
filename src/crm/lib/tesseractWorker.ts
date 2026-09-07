/**
 * Thin wrapper around tesseract.js so the scanner component doesn't need
 * to know the library's specific API — creating a worker, running OCR
 * against a canvas, and tearing the worker down are the only operations
 * this feature needs.
 */
import { createWorker, type Worker } from 'tesseract.js'

export const createScannerWorker = (): Promise<Worker> => createWorker('eng')

export const recognizeCanvas = async (worker: Worker, canvas: HTMLCanvasElement): Promise<string> => {
  const { data } = await worker.recognize(canvas)
  return data.text
}

export const destroyScannerWorker = (worker: Worker): Promise<void> => worker.terminate() as unknown as Promise<void>
