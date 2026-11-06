import type { ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
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
  TextField as AriaTextField,
  type CheckboxProps,
  type ListBoxItemProps,
  type ListBoxProps,
  type SelectProps,
  type SwitchProps,
  type TextFieldProps,
} from 'react-aria-components'

const field = 'grid gap-1.5 text-sm'
const help = 'text-sm text-text-muted'
const error = 'text-sm text-danger'
const control =
  'h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text transition-colors data-focused:border-focus data-hovered:bg-surface data-invalid:border-danger data-disabled:cursor-not-allowed data-disabled:opacity-50'

/** Task completion. The box fills with the accent when done. */
export function Checkbox({ children, className = '', ...props }: Omit<CheckboxProps, 'className' | 'children'> & { children: ReactNode; className?: string }) {
  return (
    <AriaCheckbox {...props} className={`group flex items-center gap-3 text-sm outline-none data-disabled:opacity-50 ${className}`}>
      <span className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-surface-raised text-accent-contrast transition-colors group-data-selected:border-accent group-data-selected:bg-accent group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
        <Check size={14} className="opacity-0 group-data-selected:opacity-100" />
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
  ...props
}: Omit<TextFieldProps, 'className'> & { label: string; description?: string; errorMessage?: string; className?: string }) {
  return (
    <AriaTextField {...props} className={`${field} ${className}`}>
      <Label className="font-medium">{label}</Label>
      <Input className={`${control} placeholder:text-text-muted`} />
      {description && <Text slot="description" className={help}>{description}</Text>}
      <FieldError className={error}>{errorMessage}</FieldError>
    </AriaTextField>
  )
}

const popover =
  'min-w-(--trigger-width) rounded-lg border border-border bg-surface-raised p-1 text-text shadow-lg outline-none data-entering:animate-rise'

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
        <SelectValue className="truncate" />
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

export { popover as popoverClass }
