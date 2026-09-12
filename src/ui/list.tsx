// Grouped settings list: a small caption above full-width rows split by hairlines, for use inside a FormSheet.
import { useId, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { Checkbox as AriaCheckbox, Label, Radio as AriaRadio, RadioGroup, type CheckboxProps, type RadioGroupProps } from 'react-aria-components'

const caption = 'block px-4 pt-5 pb-2 text-sm text-text-muted'
const box = 'border-y border-border bg-surface-raised'
// The hairline between rows starts 16px in, under the control column; hover and focus still fill the whole row.
const row =
  'group relative flex cursor-default items-center gap-4 px-4 text-base text-text outline-none transition-colors not-first:before:absolute not-first:before:top-0 not-first:before:right-0 not-first:before:left-4 not-first:before:border-t not-first:before:border-border data-hovered:bg-surface-muted data-pressed:bg-surface-muted data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:-outline-offset-2 data-focus-visible:outline-focus'

/** A captioned group of CheckboxRows. */
export function ListSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId()
  return (
    <div role="group" aria-labelledby={id}>
      <span id={id} className={caption}>
        {title}
      </span>
      <div className={box}>{children}</div>
    </div>
  )
}

/** A captioned radio group of RadioRows. Arrow keys move between the rows. */
export function RadioListSection({ title, children, ...props }: Omit<RadioGroupProps, 'className' | 'children'> & { title: string; children: ReactNode }) {
  return (
    <RadioGroup {...props}>
      <Label className={caption}>{title}</Label>
      <div className={box}>{children}</div>
    </RadioGroup>
  )
}

/** A full-width checkbox row; the whole row is the hit target. */
export function CheckboxRow({ children, ...props }: Omit<CheckboxProps, 'className' | 'children'> & { children: ReactNode }) {
  return (
    <AriaCheckbox {...props} className={`${row} min-h-13`}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-raised text-accent-contrast transition-colors group-data-selected:border-accent group-data-selected:bg-accent">
        <Check size={14} aria-hidden="true" className="opacity-0 group-data-selected:opacity-100" />
      </span>
      {children}
    </AriaCheckbox>
  )
}

/** A full-width radio row with an optional muted second line, which is read as part of its name. */
export function RadioRow({ value, children, description }: { value: string; children: string; description?: string }) {
  return (
    // The explicit name adds the comma pause ("4 Weeks Ago, From Oct 12"); text content alone would read without it.
    <AriaRadio value={value} aria-label={description ? `${children}, ${description}` : undefined} className={`${row} min-h-16 py-2.5`}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-raised transition-colors group-data-selected:border-accent">
        <span className="size-2.5 rounded-full bg-accent opacity-0 group-data-selected:opacity-100" />
      </span>
      <span className="grid">
        <span>{children}</span>
        {description && <span className="text-sm text-text-muted tabular-nums">{description}</span>}
      </span>
    </AriaRadio>
  )
}
