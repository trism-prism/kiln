// Class strings shared by the form controls. A leaf module (no imports), so `form` and `date` can both use it
// without importing each other.
export const controlClass =
  'h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text transition-colors data-focused:border-focus data-hovered:bg-surface data-invalid:border-danger data-disabled:cursor-not-allowed data-disabled:opacity-50'

export const popoverClass =
  'min-w-(--trigger-width) rounded-lg border border-border bg-surface-raised p-1 text-text shadow-lg outline-none data-entering:animate-rise'
