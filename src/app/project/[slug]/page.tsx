import { notFound } from 'next/navigation';
import Wall from '@/components/Wall';
import { db } from '@/lib/db';
import type { Collection, Item, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sql = db();
  const projectRows = (await sql`select * from projects where slug = ${slug} limit 1`) as unknown as Project[];
  if (!projectRows.length) notFound();
  const project = projectRows[0] as Project;
  const [projects, collections, items] = await Promise.all([sql`select * from projects order by position asc, created_at asc`, sql`select * from collections order by position asc, created_at asc`, sql`select * from items order by position asc`]);
  return <Wall initialProjects={projects as Project[]} initialCollections={collections as Collection[]} initialItems={items as Item[]} initialProject={project.id} />;
}
