import type { ReactNode } from 'react'
import { Link } from '../../ui/button'
import { Card } from '../../ui/surface'
import { CONTACT_EMAIL } from '../contact'
import { Page } from '../Page'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Card>
      <section aria-labelledby={id} className="grid gap-2 text-sm">
        <h2 id={id} className="text-base font-medium">{title}</h2>
        {children}
      </section>
    </Card>
  )
}

export default function TermsPage() {
  return (
    <Page title="Terms of use">
      <div className="grid max-w-3xl gap-4">
        <p role="note" className="rounded-lg border border-warning bg-surface-raised p-4 text-sm">
          <strong className="font-medium">Draft for the owner&apos;s review.</strong> These terms are written in plain language and are not legal advice. They have not been reviewed by a lawyer and may change before the launch.
        </p>

        <Section id="using" title="Using Kiln">
          <p>
            Kiln is a free study planner. You can use it to import or build study plans, get a daily to-do list, track progress and set reminders. By using Kiln you agree to these terms. If you do not agree, please do not use it.
          </p>
        </Section>

        <Section id="data" title="Your data">
          <p>
            Your plans and progress belong to you. They are stored on your device and are only sent anywhere if you turn on sync or reminders. <Link href="/privacy">The privacy page</Link> lists exactly what leaves your device. You are responsible for keeping a backup (Settings &gt; Backup) and, if you use sync, for keeping your 24 recovery words safe. We cannot recover them for you.
          </p>
        </Section>

        <Section id="plans" title="Plans and schedules">
          <p>
            Kiln&apos;s dates, finish estimates and reminders are planning aids, not promises. A plan you import or paste, including one written by an AI chat, may contain mistakes. Check it, and check deadlines with your school or employer. Links in a plan go to other websites that Kiln does not control.
          </p>
        </Section>

        <Section id="use" title="Fair use">
          <p>
            Do not try to break, overload or probe the service, and do not use it to store or share anything unlawful. Free services have limits; we may rate-limit or block use that harms the service for others.
          </p>
        </Section>

        <Section id="warranty" title="No guarantees">
          <p>
            Kiln is provided as it is, without warranties of any kind. It may be unavailable, lose data or contain bugs. To the extent the law allows, the author is not liable for losses that come from using Kiln, including missed deadlines or lost study data.
          </p>
        </Section>

        <Section id="software" title="Software and content">
          <p>
            Kiln is built with open-source software; see <Link href="/licenses">Open-source licenses</Link>. The Kiln name and design belong to the author. Your own plans and notes stay yours.
          </p>
        </Section>

        <Section id="changes" title="Changes and contact">
          <p>
            We may update these terms. The date of the latest change will be shown here. Questions or requests: <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>.
          </p>
        </Section>
      </div>
    </Page>
  )
}
