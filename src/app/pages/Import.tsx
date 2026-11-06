import { BuildTab } from '../import/BuildTab'
import { ImportTab } from '../import/ImportTab'
import { PromptButtons } from '../import/PromptButtons'
import { Tab, TabList, TabPanel, Tabs } from '../../ui/tabs'
import { Page } from '../Page'

// shouldForceMount keeps both tabs' forms alive while the other tab is showing; Tabs marks the
// hidden panel `data-inert`.
const keep = 'in-data-inert:hidden'

export default function ImportPage() {
  return (
    <Page title="Import">
      <div className="grid max-w-3xl gap-8">
        <PromptButtons />
        <Tabs className="data-focus-visible:outline-none">
          <TabList aria-label="How to add a plan">
            <Tab id="import">Import a plan</Tab>
            <Tab id="build">Build by hand</Tab>
          </TabList>
          <TabPanel id="import" shouldForceMount>
            <div className={keep}>
              <ImportTab />
            </div>
          </TabPanel>
          <TabPanel id="build" shouldForceMount>
            <div className={keep}>
              <BuildTab />
            </div>
          </TabPanel>
        </Tabs>
      </div>
    </Page>
  )
}
