import { useRef, useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { DialogTrigger, FileTrigger, Label, Radio, RadioGroup } from 'react-aria-components'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  applyBackup,
  checkBackup,
  db,
  exportBackup,
  MAX_BACKUP_CHARS,
  type BackupCheck,
  type BackupResult,
} from '../../data'
import { toLocalISODate } from '../../lib/date'
import { getSyncStatus, syncNow } from '../../sync'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { Sheet, toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'
import { Dot } from '../import/Dot'
import { API_URL } from '../../pwa/env'
import { erase, type EraseMode } from './erase'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

function Counts({ counts, labels }: { counts: BackupResult; labels: [string, string, string] }) {
  return (
    <ul className="grid gap-0.5 text-text-muted">
      {Object.entries(counts).map(([table, r]) => (
        <li key={table}>
          {table}: {r.added} {labels[0]}, {r.replaced} {labels[1]}, {r.kept} {labels[2]}
        </li>
      ))}
    </ul>
  )
}

export function BackupSection() {
  const [pending, setPending] = useState<{ name: string; check: BackupCheck }>()
  const [summary, setSummary] = useState<BackupResult>()
  const [error, setError] = useState<string>()
  // Counts picks, so a slow read of an earlier file cannot replace a later one.
  const pick = useRef(0)

  async function download() {
    try {
      const blob = new Blob([await exportBackup(db)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kiln-backup-${toLocalISODate(new Date())}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Some browsers start the download after the click returns; revoking at once can cancel it.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e) {
      toasts.add({ title: 'Could not export the backup', description: message(e) }, { timeout: 8000 })
    }
  }

  async function choose(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    const mine = ++pick.current
    setPending(undefined)
    setSummary(undefined)
    setError(undefined)
    try {
      if (f.size > MAX_BACKUP_CHARS) throw new Error('The backup file is larger than 25 MB')
      const check = await checkBackup(db, await f.text())
      if (mine === pick.current) setPending({ name: f.name, check })
    } catch (e) {
      if (mine === pick.current) setError(message(e))
    }
  }

  async function confirm() {
    if (!pending) return
    const mine = ++pick.current
    try {
      const result = await applyBackup(db, pending.check)
      if (mine !== pick.current) return
      setPending(undefined)
      setSummary(result)
    } catch (e) {
      setError(message(e))
    }
  }

  return (
    <Card>
      <section aria-labelledby="backup-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="backup-heading" className="text-base font-medium">Backup</h2>
          <p className="text-sm text-text-muted">
            Export a file to keep a copy or move to another device. Importing checks the file first, shows what would change and merges it with what is here (the newer copy of each item wins). Files up to 25 MB.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onPress={download}>
            <Download /> Export backup
          </Button>
          <FileTrigger acceptedFileTypes={['.json', 'application/json']} onSelect={(files) => void choose(files as FileList | null)}>
            <Button variant="secondary">
              <Upload /> Import backup
            </Button>
          </FileTrigger>
        </div>
        {error && <p role="alert" className="text-sm text-danger">Could not import the backup: {error}</p>}
        {pending && (
          <div role="status" className="grid gap-3 text-sm">
            <p className="font-medium">{pending.name} is a valid backup. If you import it:</p>
            <Counts counts={pending.check.counts} labels={['added', 'replaced', 'stale (newer copy already here, skipped)']} />
            <div className="flex gap-3">
              <Button onPress={confirm}>Import this backup</Button>
              <Button variant="quiet" onPress={() => setPending(undefined)}>Cancel</Button>
            </div>
          </div>
        )}
        {summary && (
          <div role="status" className="grid gap-1 text-sm">
            <p className="font-medium">Backup imported</p>
            <Counts counts={summary} labels={['added', 'replaced', 'stale']} />
          </div>
        )}
      </section>
    </Card>
  )
}

const CONFIRM = 'reset'

export function DangerSection() {
  const [typed, setTyped] = useState('')
  const [mode, setMode] = useState<EraseMode>('device')
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  const sync = useLiveQuery(() => getSyncStatus(db))?.enabled === true

  const reset = () => {
    setTyped('')
    setMode('device')
    setFailure(undefined)
  }

  async function run(close: () => void) {
    setBusy(true)
    setFailure(undefined)
    try {
      const m: EraseMode = sync ? mode : 'device'
      await erase(db, m, async () => {
        if (API_URL === '') throw new Error('this build has no sync server address')
        return syncNow(db, fetch, API_URL)
      })
      toasts.add({ title: m === 'everywhere' ? 'Erased on all your devices' : 'Local data erased' }, { timeout: 5000 })
      close()
    } catch (e) {
      setFailure(message(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="border-danger">
      <section aria-labelledby="danger-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="danger-heading" className="text-base font-medium text-danger">Danger zone</h2>
          <p className="text-sm text-text-muted">
            Erase every plan, task, review and setting. Your theme choice is kept. Export a backup first if you might want your data back.
          </p>
        </div>
        <div>
          <DialogTrigger onOpenChange={reset}>
            <Button variant="danger">Reset local data</Button>
            <Sheet title="Reset local data?">
              {({ close }) => (
                <div className="grid gap-4">
                  {sync ? (
                    <RadioGroup value={mode} onChange={(v) => setMode(v as EraseMode)} className="grid gap-3 text-sm">
                      <Label className="font-medium">Sync is on. Erase:</Label>
                      <Radio value="device" className="group flex items-start gap-3">
                        <Dot />
                        <span>Erase on this device only (turns sync off). Your other devices and the server keep their data.</span>
                      </Radio>
                      <Radio value="everywhere" className="group flex items-start gap-3">
                        <Dot />
                        <span>Erase everywhere. Every item is deleted on all synced devices too. Needs a connection.</span>
                      </Radio>
                    </RadioGroup>
                  ) : (
                    <p className="text-sm text-text-muted">This device has no sync, so only this device is affected.</p>
                  )}
                  <p className="text-sm text-text-muted">This cannot be undone. Type <strong className="font-medium text-text">{CONFIRM}</strong> to confirm.</p>
                  <TextField label="Confirmation" value={typed} onChange={setTyped} autoComplete="off" />
                  {failure && <p role="alert" className="text-sm text-danger">{failure}</p>}
                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onPress={close}>Cancel</Button>
                    <Button variant="danger" isDisabled={busy || typed.trim().toLowerCase() !== CONFIRM} onPress={() => run(close)}>
                      {busy ? 'Erasing...' : 'Erase everything'}
                    </Button>
                  </div>
                </div>
              )}
            </Sheet>
          </DialogTrigger>
        </div>
      </section>
    </Card>
  )
}
