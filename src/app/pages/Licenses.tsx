import { Link } from '../../ui/button'
import { Card } from '../../ui/surface'
import { Page } from '../Page'
import packages from './licenses.json'

const CREDITS = [
  { name: 'NeetCode problem list', license: 'MIT', url: 'https://github.com/neetcode-gh/leetcode', note: 'Problem titles and topics for daily practice. Kiln links to leetcode.com for the problems themselves.' },
  { name: 'ts-fsrs', license: 'MIT', url: 'https://github.com/open-spaced-repetition/ts-fsrs', note: 'The FSRS spaced-repetition algorithm used for reviews.' },
]

export default function LicensesPage() {
  return (
    <Page title="Open-source licenses">
      <div className="grid max-w-3xl gap-4">
        <p className="text-sm text-text-muted">Kiln is built on the open-source projects below. Thank you to their authors.</p>
        <Card className="grid gap-3">
          <h2 className="text-base font-medium">Credits</h2>
          <ul className="grid gap-3 text-sm">
            {CREDITS.map((c) => (
              <li key={c.name}>
                <Link href={c.url}>{c.name}</Link> <span className="text-text-muted">({c.license})</span>
                <p className="text-text-muted">{c.note}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="grid gap-3">
          <h2 className="text-base font-medium">Packages</h2>
          <ul className="divide-y divide-border text-sm">
            {packages.map((p) => (
              <li key={p.name} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
                {p.url ? <Link href={p.url}>{p.name}</Link> : <span>{p.name}</span>}
                <span className="text-text-muted">
                  {p.version} · {p.license}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  )
}
