// The two panels of Settings > Sync that pair devices with a 6-digit code: one shows the code, the other takes it.
import { useEffect, useRef, useState } from 'react'
import { db } from '../../data'
import { API_URL } from '../../pwa/env'
import { scheduleSync } from '../../pwa/sync-runner'
import {
  cleanCode,
  enableSyncKey,
  formatCode,
  generateSyncKey,
  getSyncKey,
  hostPairing,
  joinPairing,
  type HostState,
  type JoinState,
} from '../../sync'
import { Button } from '../../ui/button'
import { TextField } from '../../ui/form'
import { toasts } from '../../ui/overlay'
import { clock, pairErrorText, triesLeft } from './sync-text'

type HostView = { code?: string; expiresAt?: number; state: HostState | { kind: 'waiting' } }

/** Shows a code for another device. `setup`: sync is off here, so a new key is made and saved once the other device has it. */
export function HostPanel({ mode, onClose }: { mode: 'setup' | 'device'; onClose: () => void }) {
  const [view, setView] = useState<HostView>({ state: { kind: 'waiting' } })
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const ctl = new AbortController()
    void (async () => {
      const key = mode === 'setup' ? generateSyncKey() : await getSyncKey(db)
      if (ctl.signal.aborted) return
      if (!key) return close.current()
      await hostPairing({
        key,
        net: { fetch: (...a) => fetch(...a), baseUrl: API_URL },
        signal: ctl.signal,
        onDelivered: mode === 'setup' ? () => enableSyncKey(db, key) : undefined,
        onState: (s) => {
          if (ctl.signal.aborted) return
          if (s.kind === 'done') {
            toasts.add({ title: 'Device connected', description: 'Your other device is getting your data now.' }, { timeout: 5000 })
            scheduleSync(0)
            return close.current()
          }
          setView((v) => (s.kind === 'code' ? { code: s.code, expiresAt: s.expiresAt, state: { kind: 'waiting' } } : { ...v, state: s }))
        },
      })
    })()
    return () => ctl.abort()
  }, [mode, attempt])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const s = view.state
  const dead = s.kind === 'expired' || s.kind === 'dead' || s.kind === 'error'
  const showCode = view.code !== undefined && !dead
  return (
    <div className="grid gap-3" data-testid="pair-host">
      {showCode && (
        <>
          <p className="text-sm">On your other device, open Settings &gt; Sync, choose Join with a code, and enter this code:</p>
          <p className="text-4xl font-semibold tabular-nums" data-testid="pair-code">{formatCode(view.code!)}</p>
          {view.expiresAt !== undefined && <p className="text-sm text-text-muted">Expires in {clock((view.expiresAt - now) / 1000)}</p>}
        </>
      )}
      <p role="status" className={`text-sm ${dead ? 'text-danger' : 'text-text-muted'}`}>
        {s.kind === 'waiting' && (view.code ? 'Waiting for your other device...' : 'Getting a code...')}
        {s.kind === 'wrong' && `Someone entered a wrong code. ${triesLeft(s.left)}.`}
        {s.kind === 'connecting' && 'Connecting...'}
        {s.kind === 'expired' && 'This code expired.'}
        {s.kind === 'dead' && 'Too many wrong tries, so this code no longer works.'}
        {s.kind === 'error' && pairErrorText(s.reason)}
      </p>
      <div className="flex flex-wrap gap-2">
        {dead && <Button onPress={() => {
          setView({ state: { kind: 'waiting' } })
          setAttempt((n) => n + 1)
        }}>Get a new code</Button>}
        <Button variant={dead ? 'quiet' : 'secondary'} onPress={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

type JoinView = { kind: 'idle' } | JoinState

const joinText = (s: JoinView): string => {
  switch (s.kind) {
    case 'waiting':
      return 'Connecting...'
    case 'wrong':
      return `That code did not match. Check it on your other device and try again. ${triesLeft(s.left)}.`
    case 'expired':
      return 'That code is not valid or has expired. Get a new code on your other device.'
    case 'dead':
      return 'Too many wrong tries. Get a new code on your other device.'
    case 'busy':
      return 'Another device is using this code right now. Try again in a moment.'
    case 'slow':
      return pairErrorText('slow')
    case 'error':
      return pairErrorText(s.reason)
    default:
      return ''
  }
}

/** Takes the code shown on a device that already syncs, and turns sync on with the key it hands over. */
export function JoinPanel({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [view, setView] = useState<JoinView>({ kind: 'idle' })
  const ctl = useRef<AbortController>(undefined)
  useEffect(() => () => ctl.current?.abort(), [])
  const busy = view.kind === 'waiting'

  async function join() {
    const code = cleanCode(text)
    if (code.length !== 6 || busy) return
    ctl.current?.abort()
    const c = (ctl.current = new AbortController())
    await joinPairing({
      code,
      net: { fetch: (...a) => fetch(...a), baseUrl: API_URL },
      signal: c.signal,
      onState: (s) => {
        if (c.signal.aborted) return
        setView(s)
        if (s.kind === 'wrong' || s.kind === 'dead' || s.kind === 'expired') setText('')
        if (s.kind === 'done') {
          void enableSyncKey(db, s.key).then(
            () => {
              toasts.add({ title: 'Sync is on', description: 'Getting your data from your other device. Anything already here is kept.' }, { timeout: 5000 })
              scheduleSync(0)
              onDone()
            },
            () => setView({ kind: 'error', reason: 'server' }),
          )
        }
      },
    })
  }

  const message = joinText(view)
  const problem = view.kind !== 'idle' && view.kind !== 'waiting' && view.kind !== 'done'
  return (
    <form
      className="grid gap-3"
      data-testid="pair-join"
      onSubmit={(e) => {
        e.preventDefault()
        void join()
      }}
    >
      <TextField
        label="Code from your other device"
        description="6 digits, shown under Settings > Sync on the device that already syncs."
        value={text.length > 3 ? formatCode(cleanCode(text)) : text}
        onChange={(v) => setText(cleanCode(v))}
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        isDisabled={busy}
      />
      <p role={problem ? 'alert' : 'status'} className={`text-sm ${problem ? 'text-danger' : 'text-text-muted'}`}>{message}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" isDisabled={cleanCode(text).length !== 6 || busy}>Join</Button>
        <Button variant="quiet" onPress={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
