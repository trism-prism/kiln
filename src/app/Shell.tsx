import type { ComponentType } from 'react'
import { BookOpen, CalendarDays, Ellipsis, FileUp, LayoutDashboard, ListTodo, RotateCcw, Settings } from 'lucide-react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { Button as AriaButton, MenuTrigger } from 'react-aria-components'
import { Menu, MenuItem, ToastRegion } from '../ui/overlay'
import { CountBadge, KilnMark, badgeLabel } from '../ui/surface'
import { useTodoCount } from './useTodoCount'

type NavItem = { to: string; label: string; icon: ComponentType; badge?: boolean; onTabBar?: boolean }

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
    <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface-raised px-3 py-4 md:flex">
      <NavLink to="/" className="mb-6 flex h-10 items-center gap-2 rounded-md px-3 text-lg font-semibold">
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
      <MenuTrigger>
        <AriaButton className={`${tabClass(moreActive)} cursor-default`}>
          <Ellipsis />
          More
        </AriaButton>
        <Menu aria-label="More pages" placement="top end">
          {more.map(({ to, label, icon: Icon }) => (
            <MenuItem key={to} id={to} href={to}>
              <Icon />
              {label}
            </MenuItem>
          ))}
        </Menu>
      </MenuTrigger>
    </nav>
  )
}

export function Shell() {
  const count = useTodoCount()
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-contrast focus:translate-y-0"
      >
        Skip to content
      </a>
      <Rail count={count} />
      <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-24 outline-none md:pb-0">
        <Outlet />
      </main>
      <TabBar count={count} />
      <ToastRegion />
    </div>
  )
}
