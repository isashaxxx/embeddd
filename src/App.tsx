import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { AchievementsProvider } from './hooks/useAchievements'
import { ToastProvider } from './hooks/useToasts'
import { useWorkspace, WorkspaceProvider } from './hooks/useWorkspace'
import { useRoute, type Route } from './lib/router'
import { AchievementsPage } from './pages/AchievementsPage'
import { BoardPage } from './pages/BoardPage'
import { Dashboard } from './pages/Dashboard'
import { Landing } from './pages/Landing'
import { SharedView } from './pages/SharedView'
import { TrashPage } from './pages/TrashPage'

/** Every owner page — including boards — lives next to the same sidebar. */
function AppLayout({ route }: { route: Exclude<Route, { name: 'shared' | 'landing' }> }) {
  const [query, setQuery] = useState('')
  const routeKey = route.name === 'project' || route.name === 'board' ? route.id : route.name
  useEffect(() => setQuery(''), [routeKey])

  let page
  if (query) page = <Dashboard route={route} query={query} />
  else if (route.name === 'board') page = <BoardPage key={route.id} boardId={route.id} />
  else if (route.name === 'trash') page = <TrashPage />
  else if (route.name === 'achievements') page = <AchievementsPage />
  else page = <Dashboard route={route} query="" />

  return (
    <div className={`app-layout route-${query ? 'search' : route.name}`}>
      <Sidebar route={route} query={query} onQuery={setQuery} />
      <div className="app-main">{page}</div>
    </div>
  )
}

function Routes() {
  const route = useRoute()
  const ws = useWorkspace()
  if (route.name === 'shared') return <SharedView key={route.token} token={route.token} boardId={route.boardId} />
  if (route.name === 'landing') return <Landing />
  if (!ws.loaded) return null
  return <AppLayout route={route} />
}

export default function App() {
  return (
    <ToastProvider>
      <AchievementsProvider>
        <WorkspaceProvider>
          <Routes />
        </WorkspaceProvider>
      </AchievementsProvider>
    </ToastProvider>
  )
}
