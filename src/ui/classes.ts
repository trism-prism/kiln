// Class strings shared by the form controls. A leaf module (no imports), so `form` and `date` can both use it
// without importing each other.
export const controlClass =
  'h-10 rounded-md border border-border-strong bg-surface-raised px-3 text-sm text-text transition-colors data-focused:border-focus data-hovered:bg-surface data-invalid:border-danger data-disabled:cursor-not-allowed data-disabled:opacity-50'

// Popovers use their own surface step and a control-strength outline, so an open list never blends into the card under it.
export const popoverClass =
  'min-w-(--trigger-width) rounded-lg border border-border-strong bg-surface-overlay p-1 text-text shadow-lg outline-none data-entering:animate-rise'

// Opened 4px from the trigger (React Aria's default is 8), so the help line under a field doesn't show through the gap.
export const popoverOffset = 4
