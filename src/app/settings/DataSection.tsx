import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { DialogTrigger, FileTrigger } from 'react-aria-components'
import { db, exportBackup, importBackup, resetLocalData, type BackupResult } from '../../data'
import { toLocalISODate } from '../../lib/date'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { Sheet, toasts } from '../../ui/overlay'
import { Card } from '../../ui/surface'

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function BackupSection() {
  const [summary, setSummary] = useState<BackupResult>()
  const [error, setError] = useState<string>()

  async function download() {
    const blob = new Blob([await exportBackup(db)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `kiln-backup-${toLocalISODate(new Date())}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function restore(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setSummary(undefined)
    setError(undefined)
    try {
      setSummary(await importBackup(db, await f.text()))
    } catch (e) {
      setError(message(e))
    }
  }

  return (
    <Card>
      <section aria-labelledby="backup-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="backup-heading" className="text-base font-medium">Backup</h2>
          <p className="text-sm text-text-muted">Your data lives only on this device. Export a file to keep a copy or move to another device; importing merges it with what is here.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onPress={download}>
            <Download /> Export backup
          </Button>
          <FileTrigger acceptedFileTypes={['.json', 'application/json']} onSelect={(files) => void restore(files as FileList | null)}>
            <Button variant="secondary">
              <Upload /> Import backup
            </Button>
          </FileTrigger>
        </div>
        {error && <p role="alert" className="text-sm text-danger">Could not import the backup: {error}</p>}
        {summary && (
          <div role="status" className="grid gap-1 text-sm">
            <p className="font-medium">Backup imported</p>
            <ul className="grid gap-0.5 text-text-muted">
              {Object.entries(summary).map(([table, r]) => (
                <li key={table}>
                  {table}: {r.added} added, {r.replaced} replaced, {r.kept} kept
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </Card>
  )
}

const CONFIRM = 'reset'

export function DangerSection() {
  const [typed, setTyped] = useState('')
  return (
    <Card className="border-danger">
      <section aria-labelledby="danger-heading" className="grid gap-4">
        <div className="grid gap-1">
          <h2 id="danger-heading" className="text-base font-medium text-danger">Danger zone</h2>
          <p className="text-sm text-text-muted">Erase every plan, task, review and setting on this device. Export a backup first if you might want it back.</p>
        </div>
        <div>
          <DialogTrigger onOpenChange={() => setTyped('')}>
            <Button variant="danger">Reset local data</Button>
            <Sheet title="Reset local data?">
              {({ close }) => (
                <div className="grid gap-4">
                  <p className="text-sm text-text-muted">This cannot be undone. Type <strong className="font-medium text-text">{CONFIRM}</strong> to confirm.</p>
                  <TextField label="Confirmation" value={typed} onChange={setTyped} autoComplete="off" />
                  <div className="flex justify-end gap-3">
                    <Button variant="secondary" onPress={close}>Cancel</Button>
                    <Button
                      variant="danger"
                      isDisabled={typed.trim().toLowerCase() !== CONFIRM}
                      onPress={async () => {
                        try {
                          await resetLocalData(db)
                          toasts.add({ title: 'Local data erased' }, { timeout: 5000 })
                          close()
                        } catch (e) {
                          toasts.add({ title: 'Could not erase', description: message(e) }, { timeout: 8000 })
                        }
                      }}
                    >
                      Erase everything
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
