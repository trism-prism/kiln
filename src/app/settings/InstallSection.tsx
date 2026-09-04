import { useInstall } from '../../pwa/install'
import { Button } from '../../ui/button'
import { Card } from '../../ui/surface'

/** The steps shown on iOS, where there is no install prompt. Also used by the dashboard banner. */
export function IosSteps() {
  return (
    <ol className="grid list-decimal gap-1 pl-5 text-sm">
      <li>Tap the Share button in Safari.</li>
      <li>Choose Add to Home Screen.</li>
      <li>Open Kiln from your Home Screen.</li>
    </ol>
  )
}

export function InstallSection() {
  const { canPrompt, showIosSteps, installed, install } = useInstall()
  return (
    <Card>
      <section aria-labelledby="install-heading" className="grid gap-3">
        <h2 id="install-heading" className="text-base font-medium">Install</h2>
        {installed ? (
          <p className="text-sm text-text-muted">Kiln is installed on this device.</p>
        ) : canPrompt ? (
          <>
            <p className="text-sm text-text-muted">Open Kiln from your home screen or desktop like any app, with an icon badge and offline use.</p>
            <div>
              <Button variant="secondary" onPress={() => void install()}>Install Kiln</Button>
            </div>
          </>
        ) : showIosSteps ? (
          <>
            <p className="text-sm text-text-muted">To install Kiln on iPhone or iPad:</p>
            <IosSteps />
          </>
        ) : (
          <p className="text-sm text-text-muted">
            Your browser has not offered to install Kiln yet. Look for an install option in its menu or address bar.
          </p>
        )}
      </section>
    </Card>
  )
}
