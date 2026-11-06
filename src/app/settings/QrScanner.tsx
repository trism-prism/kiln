import { useEffect, useRef, useState } from 'react'
import { Button } from '../../ui/button'

// BarcodeDetector is in Chromium (Android, desktop) but not yet in Safari or Firefox, and not in TypeScript's DOM types.
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}
type DetectorCtor = new (opts: { formats: string[] }) => Detector

export const scannerSupported = (): boolean =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia

/**
 * Opens the camera and calls `onText` with the first QR code it reads. Rendered only after the
 * person presses "Scan a QR code", so the camera permission prompt follows a user gesture.
 */
export function QrScanner({ onText, onCancel }: { onText: (text: string) => void; onCancel: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string>()
  const done = useRef(onText)
  useEffect(() => {
    done.current = onText
  })

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | undefined
    let timer: ReturnType<typeof setInterval> | undefined
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (stopped) return stream.getTracks().forEach((t) => t.stop())
        const el = video.current
        if (!el) return
        el.srcObject = stream
        await el.play()
        const detector = new (window as unknown as { BarcodeDetector: DetectorCtor }).BarcodeDetector({ formats: ['qr_code'] })
        timer = setInterval(async () => {
          try {
            const [hit] = await detector.detect(el)
            if (hit && !stopped) {
              stopped = true
              done.current(hit.rawValue)
            }
          } catch {
            // A frame that cannot be read is skipped.
          }
        }, 300)
      } catch (e) {
        const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
        setError(denied ? 'Camera access was blocked. Allow it in your browser settings, or type the words instead.' : 'Could not start the camera. Type the words instead.')
      }
    })()
    return () => {
      stopped = true
      clearInterval(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="text-sm text-danger">{error}</p>
      ) : (
        <video ref={video} muted playsInline aria-label="Camera view for scanning the sync QR code" className="aspect-square w-full max-w-xs rounded-md border border-border bg-surface-muted object-cover" />
      )}
      <div>
        <Button variant="secondary" onPress={onCancel}>Cancel scan</Button>
      </div>
    </div>
  )
}
