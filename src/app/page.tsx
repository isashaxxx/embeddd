import Wall from '@/components/Wall';
import { db } from '@/lib/db';
import type { Item, Collection } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const sql = db();
  const [collections, items] = await Promise.all([
    sql`select * from collections order by position asc, created_at asc`,
    sql`select * from items order by position asc`,
  ]);

  return <Wall initialCollections={collections as Collection[]} initialItems={items as Item[]} />;
}
