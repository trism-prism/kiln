import type { ReactNode } from 'react'
import {
  Button as AriaButton,
  Link as AriaLink,
  type ButtonProps as AriaButtonProps,
  type LinkProps as AriaLinkProps,
} from 'react-aria-components'

const base =
  'inline-flex h-10 shrink-0 cursor-default items-center justify-center gap-2 rounded-md text-sm font-medium select-none transition-[background-color,color,border-color,transform] data-disabled:cursor-not-allowed data-disabled:opacity-50 data-pressed:scale-[0.98]'

// Hover mixes the fill toward the text color: darker on light, lighter on dark, so contrast only goes up.
const variants = {
  primary:
    'bg-accent text-accent-contrast data-hovered:bg-[color-mix(in_oklab,var(--kiln-accent),var(--kiln-text)_14%)]',
  secondary: 'border border-border-strong bg-surface-raised text-text data-hovered:bg-surface-muted',
  quiet: 'text-text data-hovered:bg-surface-muted',
  danger:
    'bg-danger text-danger-contrast data-hovered:bg-[color-mix(in_oklab,var(--kiln-danger),var(--kiln-text)_14%)]',
}
export type ButtonVariant = keyof typeof variants

type ButtonProps = Omit<AriaButtonProps, 'className' | 'children'> & {
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return <AriaButton {...props} className={`${base} px-4 ${variants[variant]} ${className}`} />
}

type IconButtonProps = Omit<AriaButtonProps, 'className' | 'children' | 'aria-label'> & {
  'aria-label': string
  variant?: ButtonVariant
  className?: string
  children: ReactNode
}

/** Square button for a lone icon. The label is required because the icon has no text. */
export function IconButton({ variant = 'quiet', className = '', ...props }: IconButtonProps) {
  return <AriaButton {...props} className={`${base} ${variants[variant]} w-10 ${className}`} />
}

type LinkProps = Omit<AriaLinkProps, 'className'> & {
  /** Render the link as a button. Omit for an inline text link. */
  variant?: ButtonVariant
  className?: string
}

export function Link({ variant, className = '', ...props }: LinkProps) {
  const look = variant
    ? `${base} px-4 ${variants[variant]}`
    : 'rounded-sm text-accent underline decoration-1 underline-offset-2 data-hovered:decoration-2 data-disabled:cursor-not-allowed data-disabled:text-text-muted data-disabled:no-underline'
  // An absolute URL must not go through the router (it would be read as a path inside the app).
  if (typeof props.href === 'string' && /^(https?:\/\/|mailto:)/i.test(props.href)) {
    const { href, target, rel, children, 'aria-label': label } = props
    return (
      <a href={href} target={target} rel={rel} aria-label={label} className={`${look} ${className} hover:decoration-2`}>
        {typeof children === 'function' ? null : children}
      </a>
    )
  }
  return <AriaLink {...props} className={`${look} ${className}`} />
}
