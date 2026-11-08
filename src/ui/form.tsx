import { useId, type ReactNode } from 'react'
import { Check, ChevronDown, Minus } from 'lucide-react'
import {
  Button as AriaButton,
  Checkbox as AriaCheckbox,
  FieldError,
  Input,
  Label,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Switch as AriaSwitch,
  Text,
  TextArea,
  TextField as AriaTextField,
  type CheckboxProps,
  type ListBoxItemProps,
  type ListBoxProps,
  type SelectProps,
  type SwitchProps,
  type TextFieldProps,
} from 'react-aria-components'
import { controlClass as control, popoverClass as popover } from './classes'
import { DateField, type DateFieldProps } from './date'

// content-start: in a grid row next to a taller field (one showing an error), the rows stay at the top.
const field = 'grid content-start gap-1.5 text-sm'
const help = 'text-sm text-text-muted'
const error = 'text-sm text-danger'

/** Task completion. The box fills with the accent when done. */
export function Checkbox({ children, className = '', ...props }: Omit<CheckboxProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaCheckbox {...props} className={`group flex items-center gap-3 text-sm outline-none data-disabled:opacity-50 ${className}`}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-raised text-accent-contrast transition-colors group-data-selected:border-accent group-data-selected:bg-accent group-data-indeterminate:border-accent group-data-indeterminate:bg-accent group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
        <Check size={14} className="opacity-0 group-data-selected:opacity-100 group-data-indeterminate:hidden" />
        <Minus size={14} className="hidden group-data-indeterminate:block" />
      </span>
      {children}
    </AriaCheckbox>
  )
}

export function TextField({
  label,
  description,
  errorMessage,
  className = '',
  onInvalidChange,
  min,
  suffix,
  ...props
}: Omit<TextFieldProps, 'className'> & {
  label: string
  description?: string
  errorMessage?: string
  className?: string
  /** A unit drawn inside the box on the right ("times", "min"). */
  suffix?: string
  /** Date fields only: told whether the typed text can't be used, so the form can hold off saving. */
  onInvalidChange?: (invalid: boolean) => void
  /** Date fields only: the earliest yyyy-mm-dd allowed. */
  min?: string
}) {
  const helpId = useId()
  if (props.type === 'date') {
    return (
      <DateField
        label={label}
        value={props.value ?? ''}
        onChange={props.onChange ?? (() => {})}
        // A date field calls it after each commit, without an event; no date caller reads the event.
        onBlur={props.onBlur as DateFieldProps['onBlur']}
        onInvalidChange={onInvalidChange}
        min={min}
        isInvalid={props.isInvalid}
        errorMessage={errorMessage}
        description={description}
        className={className}
      />
    )
  }
  return (
    // The description is linked by our own id: React Aria links its description slot only on the first render,
    // so a line that appears later (Repeat's, above 1) would not be read out.
    <AriaTextField
      {...props}
      aria-describedby={[description ? helpId : '', props['aria-describedby'] ?? ''].filter(Boolean).join(' ') || undefined}
      className={`${field} ${className}`}
    >
      <Label className="font-medium">
        {/* The unit drawn in the box is hidden from screen readers, so the name carries it: "Repeat, times".
            One text node: Chrome puts a space before a separate sr-only part ("Repeat , times"). */}
        {suffix ? (
          <>
            <span aria-hidden="true">{label}</span>
            <span className="sr-only">{`${label}, ${suffix}`}</span>
          </>
        ) : (
          label
        )}
      </Label>
      {suffix ? (
        // A unit means a short number, so the box stays narrow while the description below can run wide.
        <div className="relative max-w-40">
          <Input className={`${control} w-full pr-16 placeholder:text-text-muted`} />
          <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted">
            {suffix}
          </span>
        </div>
      ) : (
        <Input className={`${control} placeholder:text-text-muted`} />
      )}
      {description && <span id={helpId} className={help}>{description}</span>}
      <FieldError className={error}>{errorMessage}</FieldError>
    </AriaTextField>
  )
}

/** Multi-line text field (pasted keys and similar). */
export function TextAreaField({
  label,
  description,
  className = '',
  rows = 4,
  ...props
}: Omit<TextFieldProps, 'className'> & { label: string; description?: string; className?: string; rows?: number }) {
  return (
    <AriaTextField {...props} className={`${field} ${className}`}>
      <Label className="font-medium">{label}</Label>
      <TextArea rows={rows} className={`${control} h-auto py-2 placeholder:text-text-muted`} />
      {description && <Text slot="description" className={help}>{description}</Text>}
    </AriaTextField>
  )
}

export function ListBox<T extends object>({ className = '', ...props }: Omit<ListBoxProps<T>, 'className'> & { className?: string }) {
  return <AriaListBox {...props} className={`outline-none ${className}`} />
}

export function ListBoxItem({ children, ...props }: Omit<ListBoxItemProps, 'className' | 'children'> & { children: string }) {
  return (
    <AriaListBoxItem
      {...props}
      textValue={children}
      className="group flex h-9 cursor-default items-center gap-2 rounded-md px-3 text-sm outline-none data-focused:bg-surface-muted data-focus-visible:outline-2 data-focus-visible:-outline-offset-2"
    >
      <span className="flex-1">{children}</span>
      <Check size={16} className="text-accent opacity-0 group-data-selected:opacity-100" />
    </AriaListBoxItem>
  )
}

/**
 * What a select's button shows: the chosen item's text only. By default `SelectValue` renders the item's whole
 * children, including its (block, invisible) check icon, which made the box 36px tall and pushed the text up.
 */
export function SelectedText({ className = '' }: { className?: string }) {
  return (
    <SelectValue className={`truncate ${className}`}>
      {({ isPlaceholder, selectedText, defaultChildren }) => (isPlaceholder ? defaultChildren : selectedText)}
    </SelectValue>
  )
}

export function Select<T extends object>({
  label,
  description,
  children,
  className = '',
  ...props
}: Omit<SelectProps<T>, 'className' | 'children'> & { label: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <AriaSelect {...props} className={`${field} ${className}`}>
      <Label className="font-medium">{label}</Label>
      <AriaButton className={`${control} flex cursor-default items-center justify-between gap-2 text-left`}>
        <SelectedText />
        <ChevronDown className="text-text-muted" />
      </AriaButton>
      {description && <Text slot="description" className={help}>{description}</Text>}
      <FieldError className={error} />
      <Popover className={popover}>
        <ListBox>{children}</ListBox>
      </Popover>
    </AriaSelect>
  )
}

export function Switch({ children, className = '', ...props }: Omit<SwitchProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaSwitch {...props} className={`group flex items-center gap-3 text-sm outline-none data-disabled:opacity-50 ${className}`}>
      <span className="flex h-6 w-10 shrink-0 items-center rounded-full bg-border-strong p-0.5 transition-colors group-data-selected:bg-accent group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
        <span className="size-5 rounded-full bg-surface-raised shadow-sm transition-transform group-data-selected:translate-x-4" />
      </span>
      {children}
    </AriaSwitch>
  )
}

export { controlClass, popoverClass } from './classes'
