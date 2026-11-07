import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { parseDate } from '@internationalized/date'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Dialog,
  DialogTrigger,
  FieldError,
  Heading,
  Input,
  Label,
  Popover,
  Text,
  TextField as AriaTextField,
  useLocale,
} from 'react-aria-components'
import { formatDay, isRealISODate, toLocalISODate } from '../lib/date'
import { parseDateText } from '../lib/date-parse'
import { IconButton } from './button'
import { controlClass, popoverClass } from './classes'

export interface DateFieldProps {
  /** Visible label. Without one, pass `aria-label`. */
  label?: string
  'aria-label'?: string
  /** yyyy-mm-dd, or '' for no date. */
  value: string
  onChange: (value: string) => void
  /** Called after each commit (leaving the box, Enter, a day picked in the calendar), once the new value has rendered. */
  onBlur?: () => void
  /** Told whether the text in the box can't be used (unreadable, or outside min and max), so a form can wait for a fix. */
  onInvalidChange?: (invalid: boolean) => void
  /** yyyy-mm-dd bounds, inclusive. */
  min?: string
  max?: string
  isInvalid?: boolean
  errorMessage?: string
  description?: string
  /** 'sm' is the 36px version for table cells. */
  size?: 'md' | 'sm'
  className?: string
}

const display = (value: string) => (isRealISODate(value) ? formatDay(value, true) : '')

/**
 * A date typed as plain text ("fri", "nov 20", "11/20", "2026-11-20") or picked from a calendar. Nothing
 * jumps and nothing is selected while typing, so a typo is fixed like any text. A date that reads is passed
 * on as you type; on leaving the box or Enter the text is tidied to "Fri, Nov 20, 2026". Text that can't be
 * read stays as typed with an error, and the value goes back to what it was before this edit.
 */
export function DateField({
  label,
  'aria-label': ariaLabel,
  value,
  onChange,
  onBlur,
  onInvalidChange,
  min,
  max,
  isInvalid,
  errorMessage,
  description,
  size = 'md',
  className = '',
}: DateFieldProps) {
  const { locale } = useLocale()
  const [text, setText] = useState(() => display(value))
  const [focused, setFocused] = useState(false)
  const [problem, setProblem] = useState('')
  // The value when this edit began, to go back to if the text ends up unreadable.
  const [before, setBefore] = useState(value)
  // The last value this field sent, so its own change doesn't overwrite the text being typed.
  const [sent, setSent] = useState<string | null>(null)
  const [seen, setSeen] = useState(value)
  const [commits, setCommits] = useState(0)
  const [open, setOpen] = useState(false)

  if (value !== seen) {
    setSeen(value)
    if (value === sent) setSent(null)
    else if (!focused) {
      setText(display(value))
      setProblem('')
      setBefore(value)
    }
  }

  const committed = useEffectEvent(() => onBlur?.())
  useEffect(() => {
    if (commits > 0) committed()
  }, [commits])

  // Tell the form each time the error comes or goes, whatever cleared it (a fix, or a new value from outside).
  const bad = problem !== ''
  const reported = useRef(false)
  const report = useEffectEvent((b: boolean) => onInvalidChange?.(b))
  useEffect(() => {
    if (bad === reported.current) return
    reported.current = bad
    report(bad)
  }, [bad])

  const send = (v: string) => {
    if (v === value) return
    setSent(v)
    onChange(v)
  }
  const outOfRange = (iso: string) => {
    const today = toLocalISODate(new Date())
    if (min && iso < min) return min === today ? 'Pick today or later' : `Pick ${formatDay(min, true)} or later`
    if (max && iso > max) return `Pick a date by ${formatDay(max, true)}`
    return ''
  }

  // With a minimum, "nov 7" two days ago is read as that day (and refused), not as next year's.
  const type = (t: string) => {
    setText(t)
    setProblem('')
    const iso = parseDateText(t, toLocalISODate(new Date()), locale, { recent: !!min })
    if (iso && !outOfRange(iso)) send(iso)
  }
  /** Reads the text; false when it can't be used. */
  const commit = (): boolean => {
    const t = text.trim()
    const iso = t === '' ? '' : parseDateText(t, toLocalISODate(new Date()), locale, { recent: !!min })
    const p = iso === undefined ? 'Try a date like Nov 20' : iso === '' ? '' : outOfRange(iso)
    setProblem(p)
    if (p) send(before)
    else {
      send(iso!)
      setBefore(iso!)
      setText(display(iso!))
    }
    setCommits((c) => c + 1)
    return !p
  }
  const pick = (iso: string) => {
    setText(display(iso))
    setProblem('')
    send(iso)
    setBefore(iso)
    setOpen(false)
    setCommits((c) => c + 1)
  }

  const control = size === 'sm' ? controlClass.replace('h-10', 'h-9') : controlClass
  const shownError = problem || (isInvalid ? errorMessage : '')

  return (
    <AriaTextField
      value={text}
      onChange={type}
      onFocus={() => {
        setFocused(true)
        setBefore(value)
      }}
      onBlur={() => {
        setFocused(false)
        commit()
      }}
      onKeyDown={(e) => {
        // React Aria stops key events here by default; Escape must still reach a surrounding sheet.
        e.continuePropagation()
        // Unreadable text must not submit the form around it.
        if (e.key === 'Enter' && !commit()) e.preventDefault()
      }}
      isInvalid={!!problem || isInvalid}
      aria-label={label ? undefined : ariaLabel}
      className={`grid content-start gap-1.5 text-sm ${className}`}
    >
      {label && <Label className="font-medium">{label}</Label>}
      <div className="relative">
        <Input autoComplete="off" placeholder="Nov 20" className={`${control} w-full pr-10 placeholder:text-text-muted`} />
        <DialogTrigger isOpen={open} onOpenChange={setOpen}>
          <IconButton aria-label="Choose a date" className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2 text-text-muted data-hovered:text-text">
            <CalendarDays size={16} />
          </IconButton>
          <Popover placement="bottom end" className={popoverClass}>
            <Dialog aria-label="Choose a date" className="outline-none">
              <Calendar
                // Focus starts on the chosen day (or today), so the arrow keys pick a day straight away.
                autoFocus
                value={isRealISODate(value) ? parseDate(value) : null}
                minValue={min ? parseDate(min) : undefined}
                maxValue={max ? parseDate(max) : undefined}
                onChange={(d) => pick(d.toString())}
                className="grid gap-2 p-2"
              >
                <header className="flex items-center gap-3">
                  <div role="group" aria-label="Change month" className="flex">
                    <IconButton slot="previous" variant="secondary" aria-label="Previous month" className="rounded-r-none">
                      <ChevronLeft size={16} />
                    </IconButton>
                    <IconButton slot="next" variant="secondary" aria-label="Next month" className="-ml-px rounded-l-none">
                      <ChevronRight size={16} />
                    </IconButton>
                  </div>
                  <Heading className="text-sm font-medium" />
                </header>
                <CalendarGrid className="border-separate border-spacing-0.5">
                  <CalendarGridHeader>
                    {(day) => <CalendarHeaderCell className="size-9 text-xs font-medium text-text-muted">{day}</CalendarHeaderCell>}
                  </CalendarGridHeader>
                  <CalendarGridBody>
                    {(date) => (
                      <CalendarCell
                        date={date}
                        className="flex size-9 cursor-default items-center justify-center rounded-md text-sm tabular-nums outline-none data-disabled:text-text-muted data-disabled:opacity-50 data-focus-visible:outline-2 data-focus-visible:outline-focus data-hovered:bg-surface-muted data-outside-month:invisible data-selected:bg-accent data-selected:text-accent-contrast data-today:font-semibold data-today:underline data-today:underline-offset-4"
                      />
                    )}
                  </CalendarGridBody>
                </CalendarGrid>
              </Calendar>
            </Dialog>
          </Popover>
        </DialogTrigger>
      </div>
      {description && <Text slot="description" className="text-sm text-text-muted">{description}</Text>}
      <FieldError className="text-sm text-danger">{shownError}</FieldError>
    </AriaTextField>
  )
}
