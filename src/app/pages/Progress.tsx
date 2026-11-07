// Streak & progress: the streak numbers, the one-year heatmap, and logging study done outside any plan.
// Reached from the streak chip in the tab pages' top bar.
import { useState } from 'react'
import { Button } from '../../ui/button'
import { Card, Skeleton } from '../../ui/surface'
import { Heatmap, StreakNumbers } from '../calendar/Streak'
import { Page } from '../Page'
import { LogTimeSheet } from '../progress/LogTimeSheet'
import { useStudy, useToday } from '../queries'

export default function ProgressPage() {
  const today = useToday()
  const study = useStudy(today)
  const [logging, setLogging] = useState(false)

  return (
    <Page title="Streak & progress" back>
      {!study ? (
        <div aria-hidden="true" className="grid gap-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          <Card>
            <StreakNumbers stats={study.stats} />
          </Card>
          <div className="flex md:justify-end">
            <Button className="w-full md:w-auto" onPress={() => setLogging(true)}>
              Log study time
            </Button>
          </div>
          <Card>
            <Heatmap days={study.days} today={today} settings={study.settings} />
          </Card>
        </div>
      )}
      <LogTimeSheet isOpen={logging} today={today} onClose={() => setLogging(false)} />
    </Page>
  )
}
