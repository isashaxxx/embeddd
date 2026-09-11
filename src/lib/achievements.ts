export type Counter =
  | 'cards'
  | 'links'
  | 'photos'
  | 'videos'
  | 'texts'
  | 'sketches'
  | 'widgets'
  | 'files'
  | 'projects'
  | 'boards'
  | 'tagged'
  | 'described'
  | 'shares'
  | 'exports'
  | 'restored'
  | 'emptiedTrash'
  | 'activeDays'

export interface AchievementDef {
  id: string
  title: string
  description: string
  emoji: string
  counter: Counter
  goal: number
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-spark', title: 'First spark', description: 'Save your first card', emoji: '✨', counter: 'cards', goal: 1 },
  { id: 'collector', title: 'Collector', description: 'Save 50 cards', emoji: '🗃️', counter: 'cards', goal: 50 },
  { id: 'curator', title: 'Curator', description: 'Save 250 cards', emoji: '🏛️', counter: 'cards', goal: 250 },
  { id: 'link-hunter', title: 'Link hunter', description: 'Save 25 links', emoji: '🔗', counter: 'links', goal: 25 },
  { id: 'shutterbug', title: 'Shutterbug', description: 'Add 10 photos', emoji: '📸', counter: 'photos', goal: 10 },
  { id: 'director', title: 'Director', description: 'Add 5 videos', emoji: '🎬', counter: 'videos', goal: 5 },
  { id: 'wordsmith', title: 'Wordsmith', description: 'Write 10 notes', emoji: '✍️', counter: 'texts', goal: 10 },
  { id: 'doodler', title: 'Doodler', description: 'Draw your first sketch', emoji: '🎨', counter: 'sketches', goal: 1 },
  { id: 'widget-fan', title: 'Widget fan', description: 'Add 3 widgets', emoji: '🧭', counter: 'widgets', goal: 3 },
  { id: 'filer', title: 'Filer', description: 'Attach 5 files', emoji: '📎', counter: 'files', goal: 5 },
  { id: 'architect', title: 'Architect', description: 'Create 3 projects', emoji: '📐', counter: 'projects', goal: 3 },
  { id: 'board-builder', title: 'Board builder', description: 'Create 10 boards', emoji: '🧱', counter: 'boards', goal: 10 },
  { id: 'tag-master', title: 'Tag master', description: 'Tag 20 cards', emoji: '🏷️', counter: 'tagged', goal: 20 },
  { id: 'storyteller', title: 'Storyteller', description: 'Describe 10 cards', emoji: '📖', counter: 'described', goal: 10 },
  { id: 'publisher', title: 'Publisher', description: 'Share a public link', emoji: '🌍', counter: 'shares', goal: 1 },
  { id: 'archivist', title: 'Archivist', description: 'Export a board', emoji: '📦', counter: 'exports', goal: 1 },
  { id: 'second-chance', title: 'Second chance', description: 'Restore something from Trash', emoji: '♻️', counter: 'restored', goal: 1 },
  { id: 'fresh-start', title: 'Fresh start', description: 'Empty the Trash', emoji: '🧹', counter: 'emptiedTrash', goal: 1 },
  { id: 'regular', title: 'Regular', description: 'Visit on 7 different days', emoji: '🔥', counter: 'activeDays', goal: 7 },
  { id: 'devoted', title: 'Devoted', description: 'Visit on 30 different days', emoji: '🌙', counter: 'activeDays', goal: 30 },
]

/** Lifetime counters: deleting a card later doesn't take an achievement away. */
export interface AchievementState {
  counters: Partial<Record<Counter, number>>
  unlocked: Record<string, number>
  lastActiveDay?: string
}

export const today = () => new Date().toISOString().slice(0, 10)

export function newlyUnlocked(state: AchievementState): AchievementDef[] {
  return ACHIEVEMENTS.filter((a) => !state.unlocked[a.id] && (state.counters[a.counter] ?? 0) >= a.goal)
}
