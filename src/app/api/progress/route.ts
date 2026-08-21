import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const definitions = [
  { key: 'hello', title: 'Добро пожаловать', description: 'Посетить embeddd', icon: '👋', xp: 10, metric: 'visits', target: 1 },
  { key: 'first_item', title: 'Первый референс', description: 'Добавить первую карточку', icon: '📌', xp: 20, metric: 'items', target: 1 },
  { key: 'first_collection', title: 'Начало системы', description: 'Создать первую коллекцию', icon: '🗂️', xp: 25, metric: 'collections', target: 1 },
  { key: 'ten_items', title: 'Первая доска', description: 'Собрать 10 карточек', icon: '✨', xp: 50, metric: 'items', target: 10 },
  { key: 'five_collections', title: 'Куратор', description: 'Создать 5 коллекций', icon: '🎨', xp: 75, metric: 'collections', target: 5 },
  { key: 'ten_tagged', title: 'Навёл порядок', description: 'Получить теги для 10 карточек', icon: '🏷️', xp: 60, metric: 'tagged', target: 10 },
  { key: 'fifty_items', title: 'Архивариус', description: 'Собрать 50 карточек', icon: '🏆', xp: 150, metric: 'items', target: 50 },
] as const;

export async function GET() {
  const sql = db();
  await sql`insert into user_stats (id, visits, last_visit) values ('main', 0, null) on conflict (id) do nothing`;
  await sql`update user_stats set visits = visits + 1, last_visit = current_date where id = 'main' and last_visit is distinct from current_date`;

  const [counts] = await sql`
    select
      (select count(*)::int from items) as items,
      (select count(*)::int from collections) as collections,
      (select count(*)::int from items where cardinality(tags) > 0) as tagged,
      (select visits from user_stats where id = 'main') as visits,
      (select ai_credits from user_stats where id = 'main') as ai_credits` as unknown as Record<string, number>[];
  const before = await sql`select key, unlocked_at from achievements` as unknown as { key: string; unlocked_at: string }[];
  const beforeKeys = new Set(before.map((row) => row.key));

  for (const achievement of definitions) {
    if (Number(counts[achievement.metric] || 0) >= achievement.target) {
      await sql`insert into achievements (key) values (${achievement.key}) on conflict (key) do nothing`;
    }
  }

  const unlockedRows = await sql`select key, unlocked_at from achievements` as unknown as { key: string; unlocked_at: string }[];
  const unlocked = new Map(unlockedRows.map((row) => [row.key, row.unlocked_at]));
  const achievements = definitions.map((achievement) => ({
    ...achievement,
    unlocked: unlocked.has(achievement.key),
    unlocked_at: unlocked.get(achievement.key) || null,
    progress: Math.min(Number(counts[achievement.metric] || 0), achievement.target),
  }));
  const xp = achievements.filter((achievement) => achievement.unlocked).reduce((sum, achievement) => sum + achievement.xp, 0);
  const level = xp >= 450 ? 4 : xp >= 250 ? 3 : xp >= 100 ? 2 : 1;
  const nextLevelXp = level === 1 ? 100 : level === 2 ? 250 : level === 3 ? 450 : 450;

  return NextResponse.json({
    xp,
    aiCredits: Number(counts.ai_credits || 0),
    level,
    nextLevelXp,
    achievements,
    newlyUnlocked: unlockedRows.filter((row) => !beforeKeys.has(row.key)).map((row) => row.key),
  });
}

/** Ручное пополнение AI-кредитов (например, для тестирования — постоянного авто-пополнения нет). */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const delta = Number.isFinite(body?.delta) && body.delta > 0 ? Math.min(Math.round(body.delta), 1000) : 100;
  const sql = db();
  await sql`insert into user_stats (id, visits, last_visit, ai_credits) values ('main', 0, null, 100) on conflict (id) do nothing`;
  const rows = (await sql`update user_stats set ai_credits = ai_credits + ${delta} where id = 'main' returning ai_credits`) as unknown as { ai_credits: number }[];
  return NextResponse.json({ aiCredits: Number(rows[0]?.ai_credits || 0) });
}
