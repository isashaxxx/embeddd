import { NextResponse } from 'next/server';
import { db, slugify, uid } from '@/lib/db';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };

const COLORS = ['#C6F04A', '#FFB86B', '#87CEEB', '#D6B4FC', '#FF8F8F'];

/** Отдаёт первый борд проекта, создавая "Board 1", если бордов ещё нет. Один
 * INSERT ... WHERE NOT EXISTS вместо клиентского SELECT-затем-INSERT: два
 * параллельных запроса (например из двух вкладок, одновременно заливающих
 * файлы в пустой проект) больше не могут оба увидеть "бордов нет" и оба
 * создать по своему "Board 1". */
export async function POST(_req: Request, { params }: Ctx) {
  const { id: projectId } = await params;
  const sql = db();

  const project = (await sql`select id from projects where id = ${projectId} limit 1`) as unknown as { id: string }[];
  if (!project.length) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const newId = uid();
  const slug = `${slugify('Board 1')}-${newId.slice(-6)}`;
  const count = (await sql`select count(*)::int as count from collections where project_id = ${projectId}`) as unknown as { count: number }[];
  const color = COLORS[count[0].count % COLORS.length];

  await sql`
    insert into collections (id, slug, name, color, position, project_id)
    select ${newId}, ${slug}, 'Board 1', ${color}, 0, ${projectId}
    where not exists (select 1 from collections where project_id = ${projectId})`;

  const board = (await sql`select * from collections where project_id = ${projectId} order by position asc, created_at asc limit 1`) as unknown[];
  return NextResponse.json(board[0]);
}
