import { Suspense, lazy, type ComponentType } from 'react'
import { BookOpen, CalendarDays, Ellipsis, FileUp, LayoutDashboard, ListTodo, RotateCcw, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { WeekStartContext } from '../ui/date'
import { CountBadge, KilnMark, Skeleton, badgeLabel } from '../ui/surface'
import { HomeExtras } from './HomeExtras'
import { useWeekStart } from './queries'
import { useTodoCount } from './useTodoCount'

// Menus and toasts pull in most of React Aria's overlay code. Splitting them off shrinks the first chunk;
// the More menu still loads right after on every screen width (the tab bar is only hidden by CSS), which is accepted.
const MoreMenu = lazy(() => import('./MoreMenu'))
const ToastRegion = lazy(() => import('../ui/overlay').then((m) => ({ default: m.ToastRegion })))

export type NavItem = { to: string; label: string; icon: ComponentType; badge?: boolean; onTabBar?: boolean }

export const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, onTabBar: true },
  { to: '/todo', label: 'To Do', icon: ListTodo, badge: true, onTabBar: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, onTabBar: true },
  { to: '/plans', label: 'Plans', icon: BookOpen, onTabBar: true },
  { to: '/brush-up', label: 'Brush up', icon: RotateCcw },
  { to: '/import', label: 'Import', icon: FileUp },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Rail({ count }: { count: number }) {
  return (
    // The wrapper stretches to the page height and carries the background; the nav inside sticks to the viewport.
    <div className="hidden w-60 shrink-0 border-r border-border bg-surface-raised md:block">
      <nav aria-label="Main" className="sticky top-0 flex h-dvh flex-col overflow-y-auto px-3 py-4">
        <NavLink to="/" end className="mb-6 flex h-10 items-center gap-2 rounded-md px-3 text-lg font-semibold">
          <KilnMark className="size-5 text-accent" />
          Kiln
        </NavLink>
        <ul className="grid gap-1">
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                aria-label={badge ? badgeLabel(label, count) : undefined}
                className={({ isActive }) =>
                  `group flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors ${
                    isActive ? 'bg-surface-muted font-medium text-text' : 'text-text-muted hover:bg-surface-muted hover:text-text'
                  }`
                }
              >
                <span className="flex text-text-muted group-aria-[current=page]:text-accent">
                  <Icon />
                </span>
                {label}{' '}
                {badge && <CountBadge count={count} className="ml-auto" />}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

const tabClass = (active: boolean) =>
  `relative flex h-14 flex-col items-center justify-center gap-1 rounded-md text-xs transition-colors ${
    active ? 'font-medium text-accent' : 'text-text-muted'
  }`

function TabBar({ count }: { count: number }) {
  const { pathname } = useLocation()
  const more = navItems.filter((i) => !i.onTabBar)
  const moreActive = more.some((i) => pathname.startsWith(i.to))
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 gap-1 border-t border-border bg-surface-raised px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden"
    >
      {navItems
        .filter((i) => i.onTabBar)
        .map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={badge ? badgeLabel(label, count) : undefined}
            className={({ isActive }) => tabClass(isActive)}
          >
            <Icon />
            {label}{' '}
            {badge && <CountBadge count={count} className="absolute top-1 left-1/2 ml-1" />}
          </NavLink>
        ))}
      {/* Loaded lazily with the menu code; the placeholder keeps the cell from jumping. */}
      <Suspense fallback={<span className={tabClass(moreActive)} aria-hidden="true"><Ellipsis />More</span>}>
        <MoreMenu items={more} className={tabClass(moreActive)} />
      </Suspense>
    </nav>
  )
}

/** Same shape as Page: the top bar, then a content block. */
function PageSkeleton() {
  return (
    <div aria-hidden="true">
      <div className="flex h-16 items-center border-b border-border px-4 md:px-8">
        <Skeleton className="h-6 w-40" />
      </div>
      <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-6 md:px-8 md:py-8">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  )
}

export function Shell() {
  const count = useTodoCount()
  const weekStart = useWeekStart()
  return (
    <WeekStartContext value={weekStart}>
      <div className="flex min-h-dvh">
        <a
          href="#main"
          className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast focus:translate-y-0"
        >
          Skip to content
        </a>
        <Rail count={count} />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-0">
          {/* Shows only on first load: the router wraps navigations in startTransition, so React keeps
              the old page on screen while the next page's chunk loads. */}
          <HomeExtras />
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
        <TabBar count={count} />
        <Suspense>
          <ToastRegion />
        </Suspense>
      </div>
    </WeekStartContext>
  )
}
