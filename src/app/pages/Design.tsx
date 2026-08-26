import type { ReactNode } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { DialogTrigger, MenuTrigger } from 'react-aria-components'
import { Button, IconButton, Link } from '../../ui/button'
import { Checkbox, ListBox, ListBoxItem, Select, Switch, TextField } from '../../ui/form'
import { Menu, MenuItem, Sheet, toasts } from '../../ui/overlay'
import { Badge, Card, CountBadge, KilnMark, Meter, ProgressBar, Skeleton } from '../../ui/surface'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'
import { Page } from '../Page'

const colors = [
  ['surface', 'Page background'],
  ['surface-raised', 'Cards, nav rail'],
  ['surface-muted', 'Hover, selection, tracks'],
  ['border', 'Hairlines'],
  ['border-strong', 'Control outlines'],
  ['text', 'Primary text'],
  ['text-muted', 'Secondary text, icons'],
  ['accent', 'Primary action, progress'],
  ['accent-contrast', 'Text on accent'],
  ['danger', 'Overdue, To Do badge'],
  ['success', 'Mastery, done'],
  ['warning', 'Due soon'],
  ['focus', 'Focus ring'],
]

const typeScale = [
  ['text-xs', '12/16', 'Counts, badges, tab bar labels'],
  ['text-sm', '14/20', 'Body, nav, controls'],
  ['text-base', '16/24', 'Card titles'],
  ['text-lg', '18/28', 'Sheet titles'],
  ['text-xl', '20/28', 'Page title'],
  ['text-3xl', '30/36', 'Key figures'],
]

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid gap-4">
      <h3 className="text-base font-medium">{title}</h3>
      {children}
    </div>
  )
}

function Gallery({ theme }: { theme: 'light' | 'dark' }) {
  return (
    <div data-theme={theme} className="grid content-start gap-10 rounded-xl border border-border bg-surface p-5 text-text md:p-6">
      <h2 className="text-lg font-medium">{theme === 'light' ? 'Light' : 'Dark'}</h2>

      <Section title="Color">
        <ul className="grid gap-2">
          {colors.map(([name, role]) => (
            <li key={name} className="flex items-center gap-3 text-sm">
              <span className="size-8 shrink-0 rounded-md border border-border" style={{ background: `var(--kiln-${name})` }} />
              <span className="font-medium">{name}</span>
              <span className="text-text-muted">{role}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <ul className="grid gap-3">
          {typeScale.map(([cls, size, use]) => (
            <li key={cls} className="flex items-baseline gap-3">
              <span className={`${cls} font-medium`}>Arrays and hashing</span>
              <span className="text-xs text-text-muted tabular-nums">
                {size} · {use}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Radius and shadow">
        <div className="flex flex-wrap gap-3 text-xs text-text-muted">
          {['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl'].map((r) => (
            <div key={r} className={`flex size-16 items-end ${r} border border-border bg-surface-raised p-2 shadow-sm`}>
              {r.replace('rounded-', '')}
            </div>
          ))}
          <div className="flex size-16 items-end rounded-lg bg-surface-raised p-2 shadow-lg">shadow-lg</div>
        </div>
      </Section>

      <Section title="Buttons and links">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Mark done</Button>
          <Button variant="secondary">Reschedule</Button>
          <Button variant="quiet">Skip</Button>
          <Button variant="danger">Delete plan</Button>
          <Button isDisabled>Disabled</Button>
          <IconButton aria-label="Add task">
            <Plus />
          </IconButton>
          <IconButton aria-label="Reset" variant="secondary">
            <RotateCcw />
          </IconButton>
        </div>
        <p className="text-sm">
          Inline link: open the <Link href="/plans">plan</Link> to see every module.
        </p>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-3">
          <CountBadge count={1} />
          <CountBadge count={3} />
          <CountBadge count={42} />
          <CountBadge count={140} />
          <Badge>Not started</Badge>
          <Badge tone="danger">Overdue</Badge>
          <Badge tone="warning">Due today</Badge>
          <Badge tone="success">Done</Badge>
          <Badge tone="accent">LeetCode</Badge>
        </div>
      </Section>

      <Section title="Card">
        <Card className="grid gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h4 className="text-base font-medium">DSA, 16 weeks</h4>
              <p className="mt-1 text-sm text-text-muted">Week 3 of 16 · Two pointers</p>
            </div>
            <Badge tone="danger">2 overdue</Badge>
          </div>
          <ProgressBar label="Plan progress" value={18} />
          <Meter label="Mastery" value={42} />
        </Card>
      </Section>

      <Section title="Task checkbox">
        <div className="grid gap-3">
          <Checkbox>Read: sliding window patterns</Checkbox>
          <Checkbox defaultSelected>LeetCode 121, Best Time to Buy and Sell Stock</Checkbox>
          <Checkbox isDisabled>Locked until week 4</Checkbox>
        </div>
      </Section>

      <Section title="Segmented tabs">
        <Tabs>
          <TabList aria-label="Range">
            <Tab id="today">Today</Tab>
            <Tab id="week">7 days</Tab>
            <Tab id="month">28 days</Tab>
          </TabList>
          <TabPanel id="today">
            <p className="text-sm text-text-muted">4 tasks today</p>
          </TabPanel>
          <TabPanel id="week">
            <p className="text-sm text-text-muted">19 tasks in the next 7 days</p>
          </TabPanel>
          <TabPanel id="month">
            <p className="text-sm text-text-muted">71 tasks in the next 28 days</p>
          </TabPanel>
        </Tabs>
      </Section>

      <Section title="Fields">
        <div className="grid max-w-sm gap-4">
          <TextField label="Plan name" defaultValue="System design" description="Shown on the dashboard card" />
          <TextField label="Daily hours" isInvalid errorMessage="Enter a number of hours" defaultValue="lots" />
          <Select label="Reminder time" defaultSelectedKey="19">
            <ListBoxItem id="8">8:00</ListBoxItem>
            <ListBoxItem id="12">12:00</ListBoxItem>
            <ListBoxItem id="19">19:00</ListBoxItem>
          </Select>
          <Switch defaultSelected>Daily reminder</Switch>
        </div>
      </Section>

      <Section title="List box">
        <ListBox
          aria-label="Plan"
          selectionMode="single"
          defaultSelectedKeys={['dsa']}
          className="max-w-sm rounded-lg border border-border bg-surface-raised p-1"
        >
          <ListBoxItem id="dsa">DSA, 16 weeks</ListBoxItem>
          <ListBoxItem id="sd">System design</ListBoxItem>
        </ListBox>
      </Section>

      <Section title="Menu, sheet, toast">
        <div className="flex flex-wrap gap-3">
          <MenuTrigger>
            <Button variant="secondary">Task actions</Button>
            <Menu aria-label="Task actions">
              <MenuItem id="move">Move to tomorrow</MenuItem>
              <MenuItem id="skip">Skip</MenuItem>
            </Menu>
          </MenuTrigger>
          <DialogTrigger>
            <Button variant="secondary">Rate topic</Button>
            <Sheet title="How well do you know two pointers?">
              {({ close }) => (
                <div className="grid gap-4">
                  <p className="text-sm text-text-muted">Kiln schedules the next review from your answer.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {['Again', 'Hard', 'Good', 'Easy'].map((r) => (
                      <Button key={r} variant={r === 'Good' ? 'primary' : 'secondary'} onPress={close}>
                        {r}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </Sheet>
          </DialogTrigger>
          <Button
            variant="secondary"
            onPress={() => toasts.add({ title: 'Task done', description: '3 left today' }, { timeout: 5000 })}
          >
            Show toast
          </Button>
        </div>
      </Section>

      <Section title="Loading">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-2 w-full" />
        </div>
      </Section>

      <Section title="Mark">
        <KilnMark className="size-8 text-accent" />
      </Section>
    </div>
  )
}

/** Every token and component in both themes, side by side. Used for design review screenshots. */
export default function DesignPage() {
  return (
    <Page title="Design system">
      <div className="grid gap-6 lg:grid-cols-2">
        <Gallery theme="light" />
        <Gallery theme="dark" />
      </div>
    </Page>
  )
}
