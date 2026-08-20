import { notFound } from 'next/navigation';
import Wall from '@/components/Wall';
import { db } from '@/lib/db';
import type { Collection, Item, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sql = db();
  const [projects, collections, items, foundRaw] = await Promise.all([
    sql`select * from projects order by position asc, created_at asc`, sql`select * from collections order by position asc, created_at asc`,
    sql`select * from items order by position asc`, sql`select id from items where slug = ${slug} limit 1`,
  ]);
  const found = foundRaw as unknown as { id: string }[];
  if (!found.length) notFound();
  return <Wall initialProjects={projects as Project[]} initialCollections={collections as Collection[]} initialItems={items as Item[]} initialPost={slug} />;
}
