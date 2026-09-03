// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { toasts } from '../../ui/overlay'
import { ImportTab } from './ImportTab'

afterEach(cleanup)

const renderTab = () =>
  render(
    <MemoryRouter>
      <ImportTab />
    </MemoryRouter>,
  )

const fileWith = (name: string, text: () => Promise<string>) => {
  const f = new File(['x'], name)
  Object.defineProperty(f, 'text', { value: text })
  return f
}
const upload = (container: HTMLElement, f: File) =>
  fireEvent.change(container.querySelector('input[type=file]') as HTMLInputElement, { target: { files: [f] } })

describe('ImportTab file reads', () => {
  it('shows a toast when a file cannot be read', async () => {
    const { container } = renderTab()
    upload(container, fileWith('plan.json', () => Promise.reject(new Error('disk gone'))))
    await waitFor(() => expect(toasts.visibleToasts.some((t) => t.content.title === 'Could not read plan.json')).toBe(true))
    expect((screen.getByLabelText('Plan text') as HTMLTextAreaElement).value).toBe('')
  })

  it('ignores a slow read when a newer file was picked meanwhile', async () => {
    const { container } = renderTab()
    let release: (s: string) => void = () => {}
    upload(container, fileWith('slow.json', () => new Promise<string>((r) => (release = r))))
    upload(container, fileWith('fast.json', () => Promise.resolve('{"fast": true}')))
    await waitFor(() => expect((screen.getByLabelText('Plan text') as HTMLTextAreaElement).value).toBe('{"fast": true}'))
    await act(async () => release('{"slow": true}'))
    expect((screen.getByLabelText('Plan text') as HTMLTextAreaElement).value).toBe('{"fast": true}')
  })

  it('ignores a slow read when the user typed meanwhile', async () => {
    const { container } = renderTab()
    let release: (s: string) => void = () => {}
    upload(container, fileWith('slow.json', () => new Promise<string>((r) => (release = r))))
    fireEvent.change(screen.getByLabelText('Plan text'), { target: { value: 'typed' } })
    await act(async () => release('{"slow": true}'))
    expect((screen.getByLabelText('Plan text') as HTMLTextAreaElement).value).toBe('typed')
  })
})
