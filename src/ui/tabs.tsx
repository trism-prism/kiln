import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from 'react-aria-components'

/**
 * Tabs drawn as a segmented control, for switching views of the same list
 * (Today / 7 days / 28 days). Keyboard: arrow keys move between tabs.
 */
export function Tabs({ className = '', ...props }: Omit<TabsProps, 'className'> & { className?: string }) {
  // The root reports keyboard focus anywhere inside it; no ring around the whole tab area.
  return <AriaTabs {...props} className={`grid gap-6 data-focus-visible:outline-none ${className}`} />
}

export function TabList<T extends object>({ className = '', ...props }: Omit<TabListProps<T>, 'className'> & { className?: string }) {
  return <AriaTabList {...props} className={`inline-flex w-fit gap-1 rounded-lg bg-surface-muted p-1 ${className}`} />
}

export function Tab({ className = '', ...props }: Omit<TabProps, 'className'> & { className?: string }) {
  return (
    <AriaTab
      {...props}
      className={`flex h-8 cursor-default items-center rounded-md px-3 text-sm font-medium text-text-muted transition-colors data-hovered:text-text data-selected:bg-surface-raised data-selected:text-text data-selected:shadow-sm ${className}`}
    />
  )
}

export function TabPanel(props: Omit<TabPanelProps, 'className'>) {
  return <AriaTabPanel {...props} className="rounded-lg" />
}
