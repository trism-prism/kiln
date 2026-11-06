/** The circle of a radio button; the selected one gets an accent ring around a dot. */
export function Dot() {
  return (
    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-raised group-data-selected:border-accent group-data-focus-visible:outline-2 group-data-focus-visible:outline-offset-2 group-data-focus-visible:outline-focus">
      <span className="size-2.5 rounded-full bg-accent opacity-0 group-data-selected:opacity-100" />
    </span>
  )
}
