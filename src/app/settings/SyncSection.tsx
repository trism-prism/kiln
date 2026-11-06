import { useState } from 'react'
import { ScanLine } from 'lucide-react'
import { DialogTrigger } from 'react-aria-components'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data'
import { API_URL } from '../../pwa/env'
import { runSyncNow, scheduleSync, useSyncState } from '../../pwa/sync-runner'
import { disableSync, enableSync, enableSyncFromQr, getSyncSecret, getSyncStatus, type SyncSecret } from '../../sync'
import { Button } from '../../ui/button'
import { TextAreaField } from '../../ui/form'
import { Sheet, toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { QrCode } from './QrCode'
import { QrScanner, scannerSupported } from './QrScanner'
import { checkKeyInput, summaryLines } from './sync-text'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The 24 words and the QR code of this device's key, with the warning that goes with them. */
export function KeyPanel({ secret }: { secret: SyncSecret }) {
  const words = secret.mnemonic.split(' ')
  return (
    <div className="grid gap-4" data-testid="sync-key">
      <p role="note" className="text-sm text-danger">
        These words unlock all your Kiln data. Keep them private, like a password. Anyone who has them can read and change your synced data.
      </p>
      <ol aria-label="Sync key, 24 words" className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3 md:grid-cols-4">
        {words.map((w, i) => (
          <li key={i} className="tabular-nums">
            <span className="mr-2 text-text-muted">{i + 1}.</span>
            <span className="font-medium">{w}</span>
          </li>
        ))}
      </ol>
      <div className="grid gap-2">
        <p className="text-sm text-text-muted">To add a phone, join with these words, or scan this code from Join with a key.</p>
        <QrCode text={secret.qr} label="QR code of your sync key" className="size-56" />
      </div>
    </div>
  )
}

function JoinForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const check = checkKeyInput(text)

  async function join(input: string) {
    const c = checkKeyInput(input)
    if (c.state !== 'valid' || busy) return
    setBusy(true)
    setFailure(undefined)
    try {
      const net = { fetch, baseUrl: API_URL }
      const r = c.kind === 'qr' ? await enableSyncFromQr(db, input.trim(), net) : await enableSync(db, input, net)
      if (!r.ok) {
        setFailure(r.error.message)
        return
      }
      toasts.add({ title: 'Sync is on', description: 'Pulling your data from the other device.' }, { timeout: 5000 })
      scheduleSync(0)
      onDone()
    } catch (e) {
      setFailure(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-3">
      {scanning ? (
        <QrScanner
          onCancel={() => setScanning(false)}
          onText={(t) => {
            setScanning(false)
            setText(t)
            void join(t)
          }}
        />
      ) : (
        <>
          <TextAreaField
            label="Sync key"
            description="Type or paste the 24 words, or paste the text that starts with kiln-sync:"
            value={text}
            onChange={setText}
            autoComplete="off"
            spellCheck="false"
            rows={4}
          />
          <p role="status" className={`text-sm ${check.state === 'invalid' ? 'text-danger' : check.state === 'valid' ? 'text-success' : 'text-text-muted'}`}>
            {check.state === 'partial' && `${check.words} of 24 words`}
            {check.state === 'invalid' && check.message}
            {check.state === 'valid' && 'This is a valid sync key.'}
          </p>
          {failure && <p role="alert" className="text-sm text-danger">{failure}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onPress={() => void join(text)} isDisabled={check.state !== 'valid' || busy}>
              {busy ? 'Joining...' : 'Join'}
            </Button>
            {scannerSupported() && (
              <Button variant="secondary" onPress={() => setScanning(true)}>
                <ScanLine /> Scan a QR code
              </Button>
            )}
            <Button variant="quiet" onPress={onCancel}>Cancel</Button>
          </div>
        </>
      )}
    </div>
  )
}

export function SyncSection() {
  const status = useLiveQuery(() => getSyncStatus(db))
  const run = useSyncState()
  const [secret, setSecret] = useState<SyncSecret>()
  const [joining, setJoining] = useState(false)
  const [failure, setFailure] = useState<string>()
  const configured = API_URL !== ''
  const on = status?.enabled === true

  async function create() {
    setFailure(undefined)
    try {
      setSecret(await enableSync(db))
      scheduleSync(0)
    } catch (e) {
      setFailure(message(e))
    }
  }

  async function toggleKey() {
    if (secret) return setSecret(undefined)
    setSecret(await getSyncSecret(db))
  }

  return (
    <Card>
      <section aria-labelledby="sync-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="sync-heading" className="text-base font-medium">Sync</h2>
          <p className="text-sm text-text-muted">
            Keep your phone and laptop in step. Everything is encrypted on your device with a key only you hold; the server stores unreadable data.
          </p>
        </div>

        {!configured && (
          <p role="note" className="text-sm text-text-muted">
            This build has no server address (VITE_API_URL), so sync is not available. Your data stays on this device.
          </p>
        )}
        {failure && <p role="alert" className="text-sm text-danger">{failure}</p>}

        {status === undefined ? null : !on ? (
          joining ? (
            <JoinForm onDone={() => setJoining(false)} onCancel={() => setJoining(false)} />
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button onPress={create} isDisabled={!configured}>Create a sync key</Button>
              <Button variant="secondary" onPress={() => setJoining(true)} isDisabled={!configured}>Join with a key</Button>
            </div>
          )
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-1 text-sm" aria-live="polite">
              <p>
                Sync is on. Last synced:{' '}
                <span className="font-medium">{status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : 'not yet'}</span>
              </p>
              {run.last && (
                <ul className="grid gap-0.5 text-text-muted" data-testid="sync-summary">
                  {summaryLines(run.last).map((l, i) => (
                    <li key={i} className={i === 0 && run.last?.error ? 'text-danger' : ''}>{l}</li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onPress={() => void runSyncNow()} isDisabled={run.running || !configured}>
                {run.running ? 'Syncing...' : 'Sync now'}
              </Button>
              <Button variant="secondary" onPress={() => void toggleKey()}>{secret ? 'Hide key' : 'Show key'}</Button>
              <DialogTrigger>
                <Button variant="quiet">Turn off sync</Button>
                <Sheet title="Turn off sync on this device?">
                  {({ close }) => (
                    <div className="grid gap-4 text-sm">
                      <p>Your plans and tasks stay on this device. The encrypted copy stays on the server, and your other devices keep syncing with each other.</p>
                      <div className="flex gap-3">
                        <Button
                          variant="danger"
                          onPress={async () => {
                            await disableSync(db)
                            setSecret(undefined)
                            close()
                          }}
                        >
                          Turn off sync
                        </Button>
                        <Button variant="quiet" onPress={close}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </Sheet>
              </DialogTrigger>
            </div>
            {secret && <KeyPanel secret={secret} />}
          </div>
        )}
      </section>
    </Card>
  )
}
