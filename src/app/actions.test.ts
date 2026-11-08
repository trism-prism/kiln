import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// scheduleAll is the only part replaced: it fails after the entry is saved.
vi.mock('../data', async (orig) => ({ ...(await orig<typeof import('../data')>()), scheduleAll: vi.fn(() => Promise.reject(new Error('scheduler broke'))) }))

const { db, listPersonalTodos } = await import('../data')
const { logStudyTime } = await import('./actions')
const { toasts } = await import('../ui/overlay')

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('logStudyTime', () => {
  it('reports success once the entry is saved, even if rescheduling then fails, so Save is not pressed twice', async () => {
    expect(await logStudyTime('Psychology', 30, '2026-11-08')).toBe(true)
    const rows = await listPersonalTodos(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ title: 'Psychology', minutes: 30, done: true, date: '2026-11-08' })
    expect(new Date(rows[0]!.completedAt!).getHours()).toBe(12)
  })

  it('says the reschedule failed, and Undo still removes the entry', async () => {
    const added = vi.spyOn(toasts, 'add')
    expect(await logStudyTime('Spanish', 20, '2026-11-08')).toBe(true)
    const titles = added.mock.calls.map(([c]) => c.title)
    expect(titles).toContain('Could not reschedule')
    expect(titles).toContain('Logged 20 min of Spanish')
    const logged = added.mock.calls.find(([c]) => c.title === 'Logged 20 min of Spanish')![0]
    logged.action!.onPress()
    await vi.waitFor(async () => expect(await listPersonalTodos(db)).toEqual([]))
    added.mockRestore()
  })
})
