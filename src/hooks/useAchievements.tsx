import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { newlyUnlocked, today, type AchievementState, type Counter } from '../lib/achievements'
import { loadAchievements, loadItems, loadWorkspace, saveAchievements } from '../lib/storage'
import { useToast } from './useToasts'

type Track = (counter: Counter, amount?: number) => void

interface AchievementsContextValue {
  state: AchievementState | null
  track: Track
}

const AchievementsContext = createContext<AchievementsContextValue>({ state: null, track: () => {} })

/** First run: credit what the user already built so they don't start from zero. */
async function seed(): Promise<AchievementState> {
  const { projects, boards } = await loadWorkspace()
  const counters: AchievementState['counters'] = { projects: projects.length, boards: boards.length }
  for (const board of boards) {
    for (const item of await loadItems(board.id)) {
      const key: Counter | null =
        item.kind === 'link'
          ? 'links'
          : item.kind === 'image'
            ? 'photos'
            : item.kind === 'video'
              ? 'videos'
              : item.kind === 'text'
                ? 'texts'
                : item.kind === 'sketch'
                  ? 'sketches'
                  : item.kind === 'widget'
                    ? 'widgets'
                    : 'files'
      counters.cards = (counters.cards ?? 0) + 1
      counters[key] = (counters[key] ?? 0) + 1
      if (item.tags?.length) counters.tagged = (counters.tagged ?? 0) + 1
      if (item.description) counters.described = (counters.described ?? 0) + 1
    }
  }
  return { counters, unlocked: {} }
}

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [state, setState] = useState<AchievementState | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    let alive = true
    ;(async () => {
      let loaded = (await loadAchievements()) ?? (await seed())
      // Seeded or legacy unlocks are granted silently.
      const silent = newlyUnlocked(loaded)
      if (silent.length) loaded = { ...loaded, unlocked: { ...loaded.unlocked, ...Object.fromEntries(silent.map((a) => [a.id, Date.now()])) } }
      if (alive) setState(loaded)
    })()
    return () => {
      alive = false
    }
  }, [])

  const apply = useCallback(
    (update: (s: AchievementState) => AchievementState) => {
      const current = stateRef.current
      if (!current) return
      const next = update(current)
      const unlocked = newlyUnlocked(next)
      const withUnlocks = unlocked.length
        ? { ...next, unlocked: { ...next.unlocked, ...Object.fromEntries(unlocked.map((a) => [a.id, Date.now()])) } }
        : next
      stateRef.current = withUnlocks
      setState(withUnlocks)
      saveAchievements(withUnlocks)
      for (const a of unlocked) {
        toast({ emoji: a.emoji, title: `Achievement unlocked: ${a.title}`, description: a.description })
      }
    },
    [toast],
  )

  const track = useCallback<Track>(
    (counter, amount = 1) =>
      apply((s) => ({ ...s, counters: { ...s.counters, [counter]: (s.counters[counter] ?? 0) + amount } })),
    [apply],
  )

  // Count each calendar day the app is opened.
  useEffect(() => {
    if (!state || state.lastActiveDay === today()) return
    apply((s) => ({ ...s, lastActiveDay: today(), counters: { ...s.counters, activeDays: (s.counters.activeDays ?? 0) + 1 } }))
  }, [state, apply])

  return <AchievementsContext.Provider value={{ state, track }}>{children}</AchievementsContext.Provider>
}

export const useAchievements = () => useContext(AchievementsContext)
