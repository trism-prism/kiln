// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readTheme, saveTheme } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('theme storage', () => {
  it('round-trips a saved theme and applies it', () => {
    saveTheme('dark')
    expect(readTheme()).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
    saveTheme('system')
    expect(readTheme()).toBe('system')
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('ignores unknown stored values', () => {
    localStorage.setItem('kiln-theme', 'sepia')
    expect(readTheme()).toBe('system')
  })

  it('falls back to system when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readTheme()).toBe('system')
  })

  it('still applies the theme when saving throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => saveTheme('light')).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})
