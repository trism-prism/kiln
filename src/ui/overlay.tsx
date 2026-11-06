import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import {
  Button as AriaButton,
  Dialog,
  Heading,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  Modal,
  ModalOverlay,
  Popover,
  Text,
  UNSTABLE_Toast as AriaToast,
  UNSTABLE_ToastContent as ToastContent,
  UNSTABLE_ToastQueue as ToastQueue,
  UNSTABLE_ToastRegion as AriaToastRegion,
  type MenuItemProps,
  type MenuProps,
  type ModalOverlayProps,
  type PopoverProps,
} from 'react-aria-components'
import { popoverClass } from './form'

type SheetProps = Omit<ModalOverlayProps, 'className' | 'children'> & {
  title: string
  children: ReactNode | ((opts: { close: () => void }) => ReactNode)
}

/**
 * Modal dialog: a bottom sheet on phones, a centered dialog from md up.
 * Use inside a DialogTrigger, or control it with isOpen/onOpenChange.
 */
export function Sheet({ title, children, isDismissable = true, ...props }: SheetProps) {
  return (
    <ModalOverlay
      {...props}
      isDismissable={isDismissable}
      className="fixed inset-0 z-50 flex items-end justify-center bg-(--kiln-scrim) data-entering:animate-fade md:items-center md:p-6"
    >
      <Modal className="max-h-[90dvh] w-full overflow-y-auto rounded-t-xl border border-border bg-surface-raised text-text shadow-lg data-entering:animate-sheet md:max-w-md md:rounded-xl">
        <Dialog className="p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] outline-none">
          {({ close }) => (
            <>
              <div className="mb-4 flex items-start justify-between gap-4">
                <Heading slot="title" className="text-lg font-medium">
                  {title}
                </Heading>
                <AriaButton
                  onPress={close}
                  aria-label="Close"
                  className="-mt-2 -mr-2 flex size-10 items-center justify-center rounded-md text-text-muted transition-colors data-hovered:bg-surface-muted"
                >
                  <X />
                </AriaButton>
              </div>
              {typeof children === 'function' ? children({ close }) : children}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  )
}

/** Dropdown menu. Wrap the trigger and this in a MenuTrigger. */
export function Menu<T extends object>({ placement, ...props }: Omit<MenuProps<T>, 'className'> & Pick<PopoverProps, 'placement'>) {
  return (
    <Popover placement={placement} className={popoverClass}>
      <AriaMenu {...props} className="outline-none" />
    </Popover>
  )
}

export function MenuItem({ children, ...props }: Omit<MenuItemProps, 'className' | 'children'> & { children: ReactNode }) {
  return (
    <AriaMenuItem
      {...props}
      className="flex h-9 cursor-default items-center gap-3 rounded-md px-3 text-sm text-text outline-none data-focused:bg-surface-muted data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 [&_svg]:text-text-muted"
    >
      {children}
    </AriaMenuItem>
  )
}

export type ToastContentValue = { title: string; description?: string; action?: { label: string; onPress: () => void } }

const DEFAULT_TOAST_MS = 4000

/**
 * App-wide toast queue: toasts.add({ title: 'Plan imported' }). Closes after 4 s unless a timeout is given
 * (the region pauses the timer on hover and focus). A toast with an action (Undo) stays until dismissed.
 */
class ToastsQueue extends ToastQueue<ToastContentValue> {
  override add(content: ToastContentValue, options: { timeout?: number; onClose?: () => void } = {}) {
    return super.add(content, { ...options, timeout: content.action ? undefined : (options.timeout ?? DEFAULT_TOAST_MS) })
  }
}
export const toasts = new ToastsQueue({ maxVisibleToasts: 3 })

/** Mounted once by the shell, above the phone tab bar. */
export function ToastRegion() {
  return (
    <AriaToastRegion
      queue={toasts}
      className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] left-4 z-50 flex flex-col gap-2 outline-none md:bottom-6 md:left-auto md:w-72"
    >
      {({ toast }) => (
        <AriaToast
          toast={toast}
          className="flex items-start gap-2 rounded-lg bg-text py-2 pr-1.5 pl-3 text-surface shadow-lg data-entering:animate-rise"
        >
          <ToastContent role="status" className="min-w-0 flex-1 py-1">
            <Text slot="title" className="block text-sm font-medium">
              {toast.content.title}
            </Text>
            {toast.content.description && (
              <Text slot="description" className="mt-1 block text-sm">
                {toast.content.description}
              </Text>
            )}
          </ToastContent>
          {toast.content.action && (
            <AriaButton
              onPress={() => {
                toast.content.action?.onPress()
                toasts.close(toast.key)
              }}
              className="h-8 shrink-0 self-center rounded-md px-3 text-sm font-medium underline transition-colors data-hovered:bg-[color-mix(in_oklab,var(--kiln-surface)_16%,transparent)]"
            >
              {toast.content.action.label}
            </AriaButton>
          )}
          <AriaButton
            slot="close"
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-md transition-colors data-hovered:bg-[color-mix(in_oklab,var(--kiln-surface)_16%,transparent)]"
          >
            <X />
          </AriaButton>
        </AriaToast>
      )}
    </AriaToastRegion>
  )
}
