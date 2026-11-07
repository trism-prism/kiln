// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { I18nProvider } from 'react-aria-components'
import { afterEach, describe, expect, it } from 'vitest'
import { parseTyped, WeekdayMinutes } from './WeekdayMinutes'

afterEach(cleanup)

function Harness({ locale = 'en-US' }: { locale?: string }) {
  const [values, setValues] = useState(['120', '120', '120', '120', '120', '180', '180'])
  return (
    <I18nProvider locale={locale}>
      <WeekdayMinutes values={values} onChange={setValues} />
    </I18nProvider>
  )
}

describe('WeekdayMinutes steppers', () => {
  it('steps from the cleared box (0), not the saved value, and announces the result', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Monday' }))
    await user.clear(screen.getByRole('textbox', { name: 'Monday' }))
    await user.click(screen.getByRole('button', { name: 'More time on Monday' }))
    expect((screen.getByRole('textbox', { name: 'Monday' }) as HTMLInputElement).value).toBe('15')
    expect(screen.getByRole('status').textContent).toBe('Monday 15 min')
  })

  it('reads a German thousands separator', async () => {
    const user = userEvent.setup()
    render(<Harness locale="de-DE" />)
    await user.click(screen.getByRole('button', { name: 'Monday' }))
    const box = screen.getByRole('textbox', { name: 'Monday' })
    await user.clear(box)
    await user.type(box, '1.200')
    await user.click(screen.getByRole('button', { name: 'More time on Monday' }))
    expect(screen.getByRole('status').textContent).toBe('Monday 1215 min')
  })

  it('Escape on a stepper button closes the editor and refocuses the day', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: 'Monday' }))
    screen.getByRole('button', { name: 'More time on Monday' }).focus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Monday' })).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Monday' }))
  })
})

describe('parseTyped', () => {
  it('drops the locale group separator and spaces', () => {
    expect(parseTyped('1,200', 'en-US')).toBe(1200)
    expect(parseTyped('1.200', 'de-DE')).toBe(1200)
    expect(parseTyped('', 'en-US')).toBeUndefined()
  })
})
