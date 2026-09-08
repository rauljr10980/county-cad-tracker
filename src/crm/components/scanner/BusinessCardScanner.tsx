import { useEffect, useRef, useState } from 'react'
import type { Worker } from 'tesseract.js'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { hasContactSignal } from '@/crm/lib/businessCardText'
import { createScannerWorker, destroyScannerWorker, recognizeCanvas } from '@/crm/lib/tesseractWorker'

const POLL_INTERVAL_MS = 600
const DETECTION_CANVAS_WIDTH = 480
const CONFIRMATION_CANVAS_WIDTH = 1280
const HINT_AFTER_MS = 20000

type ScanState = 'loading' | 'scanning' | 'detected' | 'error'

type Props = {
  open: boolean
  onDetected: (rawText: string) => void
  onCancel: () => void
  onManualEntry: () => void
}

export function BusinessCardScanner({ open, onDetected, onCancel, onManualEntry }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const [state, setState] = useState<ScanState>('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [showHint, setShowHint] = useState(false)

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setState('loading')
    setErrorMessage('')
    setShowHint(false)

    let hintTimer: ReturnType<typeof setTimeout> | undefined
    let pollTimer: ReturnType<typeof setTimeout> | undefined

    const stopEverything = () => {
      cancelled = true
      if (hintTimer) clearTimeout(hintTimer)
      if (pollTimer) clearTimeout(pollTimer)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (workerRef.current) {
        void destroyScannerWorker(workerRef.current)
        workerRef.current = null
      }
    }

    const captureFrame = (width: number): HTMLCanvasElement | null => {
      const video = videoRef.current
      if (!video || video.videoWidth === 0) return null
      const scale = width / video.videoWidth
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = Math.round(video.videoHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      return canvas
    }

    const poll = async () => {
      if (cancelled || !workerRef.current) return
      try {
        const canvas = captureFrame(DETECTION_CANVAS_WIDTH)
        if (canvas) {
          const text = await recognizeCanvas(workerRef.current, canvas)
          if (cancelled) return
          if (hasContactSignal(text)) {
            setState('detected')
            const confirmCanvas = captureFrame(CONFIRMATION_CANVAS_WIDTH)
            const confirmedText =
              confirmCanvas && workerRef.current
                ? await recognizeCanvas(workerRef.current, confirmCanvas)
                : text
            if (cancelled) return
            if (!hasContactSignal(confirmedText)) {
              // Confirmation pass came back too sparse to be useful — treat it
              // like "no card found this round" and keep polling instead of
              // opening a near-empty review screen.
              setState('scanning')
            } else {
              stopEverything()
              onDetected(confirmedText)
              return
            }
          }
        }
      } catch (err) {
        // worker.terminate() (from stopEverything, e.g. on unmount) rejects
        // any in-flight recognize() call — expected and harmless when we're
        // the ones who cancelled. Anything else should still surface.
        if (!cancelled) throw err
        return
      }
      if (!cancelled) {
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
      }
    }

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        const worker = await createScannerWorker()
        if (cancelled) {
          void destroyScannerWorker(worker)
          return
        }
        workerRef.current = worker

        setState('scanning')
        hintTimer = setTimeout(() => setShowHint(true), HINT_AFTER_MS)
        pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        if (cancelled) return
        setState('error')
        setErrorMessage(
          err instanceof DOMException && err.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera access to scan a card, or add the contact manually.'
            : 'The scanner could not start. Add the contact manually instead.',
        )
      }
    }

    void start()

    return () => {
      stopEverything()
    }
  }, [open, onDetected])

  if (!open) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel()
      }}
    >
      <DialogContent className="max-w-lg">
        {state === 'error' ? (
          <div className="space-y-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button onClick={onManualEntry}>Add Contact Manually</Button>
          </div>
        ) : (
          <div className="relative overflow-hidden rounded-md bg-black">
            <video ref={videoRef} className="w-full" playsInline muted />
            <div
              className={`pointer-events-none absolute inset-8 rounded-md border-4 ${
                state === 'detected' ? 'border-green-500' : 'border-white/70'
              }`}
            />
            {state === 'loading' && (
              <p className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-white">
                Loading scanner…
              </p>
            )}
            {state === 'detected' && (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm font-medium text-green-400">
                Business Card Detected ✓
              </p>
            )}
            {state === 'scanning' && showHint && (
              <p className="absolute inset-x-0 bottom-4 text-center text-sm text-white/90">
                Still looking — try repositioning the card
              </p>
            )}
            <Button
              variant="ghost"
              className="absolute right-2 top-2 text-white hover:bg-white/10 hover:text-white"
              onClick={onCancel}
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
