import { Time } from '@internationalized/date'
import { ChevronDown } from 'lucide-react'
import {
  Button as AriaButton,
  DateInput,
  DateSegment,
  FieldError,
  Label,
  Popover,
  Select as AriaSelect,
  SelectValue,
  TimeField,
  useLocale,
} from 'react-aria-components'
import { controlClass, ListBox, ListBoxItem, popoverClass } from './form'

const TIME = /^([01][0-9]|2[0-3]):([0-5][0-9])$/
const pad = (n: number) => String(n).padStart(2, '0')

/** Whether a locale writes hours on a 12-hour clock (AM/PM). */
export function uses12Hours(locale: string): boolean {
  return /^h(11|12)$/.test(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')
}

/**
 * Time of day typed into hour and minute segments. `value` and `onChange` use "HH:MM" (24-hour), or "" while
 * a segment is empty. 12-hour locales get an AM/PM select with a chevron; 24-hour locales do not.
 */
export function TimeInput({
  label,
  value,
  onChange,
  isInvalid,
  errorMessage = 'Enter a time',
  className = '',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  isInvalid?: boolean
  errorMessage?: string
  className?: string
}) {
  const { locale } = useLocale()
  const twelve = uses12Hours(locale)
  const m = TIME.exec(value)
  const time = m ? new Time(Number(m[1]), Number(m[2])) : null
  const pm = time ? time.hour >= 12 : false

  return (
    <div className={`flex items-start gap-2 ${className}`}>
      <TimeField
        value={time}
        onChange={(t) => onChange(t ? `${pad(t.hour)}:${pad(t.minute)}` : '')}
        hourCycle={twelve ? 12 : 24}
        granularity="minute"
        isInvalid={isInvalid}
        className="grid gap-1.5 text-sm"
      >
        <Label className="font-medium">{label}</Label>
        <DateInput className={`${controlClass} flex w-fit items-center`}>
          {(segment) =>
            // The AM/PM select below replaces this segment.
            segment.type === 'dayPeriod' ? <></> : (
              <DateSegment
                segment={segment}
                className="rounded-sm px-0.5 tabular-nums outline-none data-focused:bg-accent data-focused:text-accent-contrast data-placeholder:text-text-muted"
              />
            )
          }
        </DateInput>
        <FieldError className="text-sm text-danger">{errorMessage}</FieldError>
      </TimeField>
      {twelve && (
        <AriaSelect
          aria-label={`${label}: AM or PM`}
          selectedKey={pm ? 'pm' : 'am'}
          isDisabled={!time}
          onSelectionChange={(k) => time && onChange(`${pad((time.hour % 12) + (k === 'pm' ? 12 : 0))}:${pad(time.minute)}`)}
          className="mt-[calc(1.25rem+0.375rem)]"
        >
          <AriaButton className={`${controlClass} flex cursor-default items-center gap-2`}>
            <SelectValue />
            <ChevronDown size={16} className="text-text-muted" />
          </AriaButton>
          <Popover className={popoverClass}>
            <ListBox>
              <ListBoxItem id="am">AM</ListBoxItem>
              <ListBoxItem id="pm">PM</ListBoxItem>
            </ListBox>
          </Popover>
        </AriaSelect>
      )}
    </div>
  )
}
