import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import type { Collection, Item } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function PublicCollection({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const sql = db();
  const collections = await sql`select * from collections where share_token = ${token} and access_mode = 'link' limit 1` as unknown as Collection[];
  const collection = collections[0];
  if (!collection) notFound();
  const items = await sql`select * from items where collection_id = ${collection.id} order by position asc, created_at desc` as unknown as Item[];

  return <main className="public-board">
    <header className="public-board-head">
      <div className="brand"><img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b></div>
      <div><h1>{collection.name}</h1><p>{items.length} элементов</p></div>
    </header>
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
  </main>;
}
