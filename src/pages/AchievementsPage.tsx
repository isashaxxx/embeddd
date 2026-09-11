import { useAchievements } from '../hooks/useAchievements'
import { ACHIEVEMENTS } from '../lib/achievements'

export function AchievementsPage() {
  const { state } = useAchievements()
  if (!state) return null

  const unlockedCount = ACHIEVEMENTS.filter((a) => state.unlocked[a.id]).length
  const percent = Math.round((unlockedCount / ACHIEVEMENTS.length) * 100)
  // Unlocked first (newest on top), then the ones closest to done.
  const ordered = [...ACHIEVEMENTS].sort((a, b) => {
    const ua = state.unlocked[a.id] ?? 0
    const ub = state.unlocked[b.id] ?? 0
    if (ua || ub) return ub - ua
    const pa = (state.counters[a.counter] ?? 0) / a.goal
    const pb = (state.counters[b.counter] ?? 0) / b.goal
    return pb - pa
  })

  return (
    <main className="dash achievements-page">
      <header className="achievements-hero">
        <div className="achievements-ring" style={{ '--p': `${percent}%` } as React.CSSProperties}>
          <span>
            {unlockedCount}
            <small>/{ACHIEVEMENTS.length}</small>
          </span>
        </div>
        <div>
          <h1>Achievements</h1>
          <p>Little milestones for the way you collect, think and make. Keep saving what inspires you.</p>
        </div>
      </header>

      <div className="achievements-grid">
        {ordered.map((a) => {
          const value = Math.min(state.counters[a.counter] ?? 0, a.goal)
          const unlockedAt = state.unlocked[a.id]
          return (
            <article key={a.id} className={`achievement${unlockedAt ? ' unlocked' : ''}`}>
              <div className="achievement-medal">
                <span>{a.emoji}</span>
              </div>
              <h3>{a.title}</h3>
              <p>{a.description}</p>
              {unlockedAt ? (
                <span className="achievement-date">
                  Unlocked {new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(unlockedAt)}
                </span>
              ) : (
                <div className="achievement-progress">
                  <div className="achievement-bar">
                    <span style={{ width: `${(value / a.goal) * 100}%` }} />
                  </div>
                  <small>
                    {value}/{a.goal}
                  </small>
                </div>
              )}
            </article>
          )
        })}
      </div>
    </main>
  )
}
