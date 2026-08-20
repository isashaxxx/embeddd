import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Account, Collection, Item, Project } from '@/lib/types';

export const dynamic = 'force-dynamic';

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 100;
  if (m >= 11 && m <= 14) return c;
  const k = n % 10;
  return k === 1 ? a : k >= 2 && k <= 4 ? b : c;
}

export default async function PublicProject({ params }: { params: Promise<{ username: string; slug: string }> }) {
  const { username, slug } = await params;
  const sql = db();

  const accounts = await sql`select * from account_profile where id = 'main' limit 1` as unknown as Account[];
  const account = accounts[0];
  if (!account || account.nickname.trim().toLocaleLowerCase() !== decodeURIComponent(username).trim().toLocaleLowerCase()) notFound();

  const projects = await sql`select * from projects where slug = ${slug} and access_mode = 'link' limit 1` as unknown as Project[];
  const project = projects[0];
  if (!project) notFound();

  const collections = await sql`select * from collections where project_id = ${project.id} order by position asc` as unknown as Collection[];
  const collectionIds = collections.map((c) => c.id);
  const items = collectionIds.length
    ? await sql`select * from items where collection_id = any(${collectionIds}) and archived_at is null order by position asc, created_at desc` as unknown as Item[]
    : [];

  return <main className="public-board">
    <header className="public-board-head">
      <div className="brand"><img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b></div>
      <div>
        <h1>{project.name}</h1>
        <p>
          С {new Date(project.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
          {' · '}{items.length} {plural(items.length, 'карточка', 'карточки', 'карточек')}
          {' · '}{collections.length} {plural(collections.length, 'борд', 'борда', 'бордов')}
        </p>
      </div>
    </header>
    {project.cover_url && <div className="public-cover"><img src={project.cover_url} alt="" /></div>}
    <div className="public-masonry">
      {items.map((item) => <article key={item.id} className="public-pin">
        {item.kind === 'image' && <img src={item.thumb || item.src || ''} alt={item.title || ''} loading="lazy" />}
        {item.kind === 'video' && <video src={item.src || ''} controls preload="metadata" />}
        {item.kind === 'embed' && item.thumb && <img src={item.thumb} alt={item.title || ''} loading="lazy" />}
        {item.kind === 'link' && item.thumb && <img src={item.thumb} alt={item.title || ''} loading="lazy" />}
        {item.kind === 'text' && <div className={`public-block public-${item.text_style || 'p'}`}>{item.title}</div>}
        {item.kind === 'callout' && <div className="public-block public-callout">{item.title}</div>}
        {item.kind === 'html' && <div className="public-block public-code">HTML-блок</div>}
        {!['text', 'callout', 'html'].includes(item.kind) && (item.title || item.note) && <div><b>{item.title}</b>{item.note && <p>{item.note}</p>}</div>}
      </article>)}
    </div>
    {!items.length && <p className="public-empty">Пока пусто</p>}
  </main>;
}
