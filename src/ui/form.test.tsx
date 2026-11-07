// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ListBoxItem, Select } from './form'

afterEach(cleanup)

describe('Select', () => {
  it('shows only the chosen text in its button, without the list check icon', () => {
    const { getByRole } = render(
      <Select label="School system" selectedKey="canvas">
        <ListBoxItem id="canvas">Canvas</ListBoxItem>
        <ListBoxItem id="other">Other</ListBoxItem>
      </Select>,
    )
    const button = getByRole('button')
    expect(button.querySelector('span.truncate')?.textContent).toBe('Canvas')
    // The chevron is the button's only icon.
    expect(button.querySelectorAll('svg')).toHaveLength(1)
  })
})
