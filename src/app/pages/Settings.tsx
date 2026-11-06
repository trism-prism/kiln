import { useState } from 'react'
import { ListBoxItem, Select } from '../../ui/form'
import { Page } from '../Page'
import { readTheme, saveTheme, type Theme } from '../theme'

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  return (
    <Page title="Settings">
      <div className="max-w-sm">
        <Select
          label="Theme"
          description="System matches your device's light or dark setting"
          selectedKey={theme}
          onSelectionChange={(key) => {
            const t = key as Theme
            setTheme(t)
            saveTheme(t)
          }}
        >
          <ListBoxItem id="system">System</ListBoxItem>
          <ListBoxItem id="light">Light</ListBoxItem>
          <ListBoxItem id="dark">Dark</ListBoxItem>
        </Select>
      </div>
    </Page>
  )
}
