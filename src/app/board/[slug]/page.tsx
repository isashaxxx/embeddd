import { notFound } from 'next/navigation';
import Wall from '@/components/Wall';
import { db } from '@/lib/db';
import type { Collection, Item, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export default async function BoardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sql = db();
  const boardRows = (await sql`select * from collections where slug = ${slug} limit 1`) as unknown as Collection[];
  if (!boardRows.length) notFound();
  const board = boardRows[0] as Collection;
  const [projects, collections, items] = await Promise.all([sql`select * from projects order by position asc, created_at asc`, sql`select * from collections order by position asc, created_at asc`, sql`select * from items order by position asc`]);
  return <Wall initialProjects={projects as Project[]} initialCollections={collections as Collection[]} initialItems={items as Item[]} initialActive={board.id} initialProject={board.project_id || 'all'} />;
}
