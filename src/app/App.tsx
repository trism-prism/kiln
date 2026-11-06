import { lazy } from 'react'
import { LucideProvider } from 'lucide-react'
import { RouterProvider } from 'react-aria-components'
import { Route, Routes, useHref, useNavigate } from 'react-router'
import { Shell } from './Shell'

// One chunk per page, so the shell loads first and each screen loads when visited.
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const TodoPage = lazy(() => import('./pages/Todo'))
const TaskPage = lazy(() => import('./pages/Task'))
const CalendarPage = lazy(() => import('./pages/Calendar'))
const PlansPage = lazy(() => import('./pages/Plans'))
const PlanPage = lazy(() => import('./pages/Plan'))
const BrushUpPage = lazy(() => import('./pages/BrushUp'))
const ImportPage = lazy(() => import('./pages/Import'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const PrivacyPage = lazy(() => import('./pages/Privacy'))
const DesignPage = lazy(() => import('./pages/Design'))
const NotFoundPage = lazy(() => import('./pages/NotFound'))

export function App() {
  const navigate = useNavigate()
  return (
    // RouterProvider makes React Aria links and menu items navigate through react-router.
    <RouterProvider navigate={navigate} useHref={useHref}>
      {/* One icon size and stroke for the whole app */}
      <LucideProvider size={18} strokeWidth={1.75}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="todo" element={<TodoPage />} />
            <Route path="task/:taskId" element={<TaskPage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="plans" element={<PlansPage />} />
            <Route path="plans/:planId" element={<PlanPage />} />
            <Route path="brush-up" element={<BrushUpPage />} />
            <Route path="import" element={<ImportPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="privacy" element={<PrivacyPage />} />
            <Route path="design" element={<DesignPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </LucideProvider>
    </RouterProvider>
  )
}
