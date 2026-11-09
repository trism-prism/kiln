import { useState } from 'react'
import { DialogTrigger } from 'react-aria-components'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../data'
import { API_URL } from '../../pwa/env'
import { runSyncNow, useSyncState } from '../../pwa/sync-runner'
import { disconnectSync, getSyncStatus } from '../../sync'
import { Button } from '../../ui/button'
import { Sheet } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { HostPanel, JoinPanel } from './PairPanels'
import { summaryLines } from './sync-text'

type Panel = 'none' | 'setup' | 'device' | 'join'

function DisconnectSheet() {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <DialogTrigger>
      <Button variant="quiet">Disconnect device</Button>
      <Sheet title="Disconnect sync?">
        {({ close }) => (
          <div className="grid gap-4 text-sm">
            <p>
              This stops sync on this device and on every device it syncs with. Each device keeps everything it has now. The synced copy is deleted from the server.
            </p>
            {failed && <p role="alert" className="text-danger">Could not reach the server, so sync is still on. Try again when you are online.</p>}
            <div className="flex gap-3">
              <Button
                variant="danger"
                isDisabled={busy}
                onPress={async () => {
                  setBusy(true)
                  setFailed(false)
                  const r = await disconnectSync(db, { fetch: (...a) => fetch(...a), baseUrl: API_URL })
                  setBusy(false)
                  if (r.ok) {
                    close()
                    // The buttons are gone; keep keyboard focus on the section.
                    setTimeout(() => document.getElementById('sync-heading')?.focus(), 0)
                  } else setFailed(true)
                }}
              >
                {busy ? 'Disconnecting...' : 'Disconnect'}
              </Button>
              <Button variant="quiet" onPress={close}>Cancel</Button>
            </div>
          </div>
        )}
      </Sheet>
    </DialogTrigger>
  )
}

export function SyncSection() {
  const status = useLiveQuery(() => getSyncStatus(db))
  const run = useSyncState()
  const [panel, setPanel] = useState<Panel>('none')
  const configured = API_URL !== ''
  const on = status?.enabled === true
  const closePanel = () => {
    setPanel('none')
    // The panel is gone; keep keyboard focus on the section.
    setTimeout(() => document.getElementById('sync-heading')?.focus(), 0)
  }

  return (
    <Card>
      <section aria-labelledby="sync-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="sync-heading" tabIndex={-1} className="text-base font-medium outline-none">Sync</h2>
          <p className="text-sm text-text-muted">
            Keep your phone and laptop in step. Everything is encrypted on your device with a key only you hold; the server stores unreadable data.
          </p>
        </div>

        {!configured && (
          <p role="note" className="text-sm text-text-muted">
            This build has no server address (VITE_API_URL), so sync is not available. Your data stays on this device.
          </p>
        )}

        {status === undefined ? null : !on ? (
          <>
            {status.disconnectedByPeer && panel === 'none' && (
              <p role="note" className="text-sm text-text-muted">Sync was turned off from another device. Everything on this device stays here.</p>
            )}
            {panel === 'setup' && <HostPanel mode="setup" onClose={closePanel} />}
            {panel === 'join' && <JoinPanel onDone={closePanel} onCancel={closePanel} />}
            {panel === 'none' && (
              <div className="flex flex-wrap gap-2">
                <Button onPress={() => setPanel('setup')} isDisabled={!configured}>Set up sync</Button>
                <Button variant="secondary" onPress={() => setPanel('join')} isDisabled={!configured}>Join with a code</Button>
              </div>
            )}
          </>
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
            {panel === 'device' && <HostPanel mode="device" onClose={closePanel} />}
            {panel !== 'device' && (
              <div className="flex flex-wrap gap-2">
                <Button onPress={() => void runSyncNow()} isDisabled={run.running || !configured}>
                  {run.running ? 'Syncing...' : 'Sync now'}
                </Button>
                <Button variant="secondary" onPress={() => setPanel('device')} isDisabled={!configured}>Sync a device</Button>
                <DisconnectSheet />
              </div>
            )}
          </div>
        )}
      </section>
    </Card>
  )
}
