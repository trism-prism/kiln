import type { ReactNode } from 'react'
import { Link } from '../../ui/button'
import { Card } from '../../ui/surface'
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

export default function PrivacyPage() {
  return (
    <Page title="Privacy">
      <div className="grid max-w-3xl gap-4">
        <p className="text-sm text-text-muted">
          Kiln has no accounts and no ads. Your study data lives on your device. This page lists everything that ever leaves it.
        </p>

        <Section id="local" title="What stays on your device">
          <p>
            Your plans, tasks, progress, reviews and settings are stored in your browser&apos;s local database on this device. Nobody else can see them, and Kiln does not upload them unless you turn on sync (below).
          </p>
        </Section>

        <Section id="reminders" title="Reminders (only if you turn them on)">
          <p>
            To send a reminder while your device is asleep, a small server keeps three things: the push address your browser gave Kiln, your reminder time (and evening nudge time, if on), and your time zone. It also keeps a random code made on your device and stored only as a hash, so only your device can change or remove its entry.
          </p>
          <p>
            It does not receive your plans, tasks or progress. The server only tells your device that a reminder is due; the text of the notification (for example &ldquo;3 tasks today&rdquo;) is worked out on your device. The push address belongs to your browser&apos;s push service (Google, Apple, Mozilla or Microsoft), which routes the message.
          </p>
        </Section>

        <Section id="sync" title="Sync (only if you turn it on)">
          <p>
            Sync copies your data between your own devices through the server. Everything is encrypted on your device with a key made from 24 words. The words never leave your devices, so the server stores only data it cannot read.
          </p>
          <p>
            The server can see when something was saved, how large it is and how many items there are, but not what they say or which plan they belong to. If you lose the 24 words and every device that has them, the synced copy cannot be recovered.
          </p>
        </Section>

        <Section id="ping" title="Daily active-device count">
          <p>
            Once a day, when you open Kiln, your device sends one random device ID (made on your device, not linked to you) so the author can count how many devices use the app each week. The server stores a hash of that ID and the date. Nothing else is sent: no plan data, no name, no email.
          </p>
        </Section>

        <Section id="analytics" title="Page statistics">
          <p>
            The deployed site uses Cloudflare Web Analytics to count page views and measure speed. It is cookieless: it sets no cookies, does not follow you across sites and does not fingerprint your browser.
          </p>
          <p>
            Like any website, the host sees your IP address and the time of each request while serving it. Kiln&apos;s server does not store IP addresses.
          </p>
        </Section>

        <Section id="delete" title="How to delete your data">
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              <strong className="font-medium">Reminders:</strong> turn them off under Settings &gt; Reminders. This asks the server to remove this device; if it cannot be reached, the server drops the device the next time a reminder cannot be delivered.
            </li>
            <li>
              <strong className="font-medium">Sync:</strong> turn it off under Settings &gt; Sync to stop syncing. The encrypted copy stays on the server (it cannot be read without your key, and there is no delete button for it yet). To remove your data from every device, use &ldquo;Erase everywhere&rdquo; in the danger zone while sync is on.
            </li>
            <li>
              <strong className="font-medium">This device:</strong> Settings &gt; Danger zone erases all local data and turns reminders off. Clearing the site&apos;s data in your browser does the same and also forgets the random device ID.
            </li>
          </ul>
          <p>
            <Link href="/settings">Go to Settings</Link>
          </p>
        </Section>
      </div>
    </Page>
  )
}
