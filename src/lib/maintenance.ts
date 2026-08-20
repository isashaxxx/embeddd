import { db } from '@/lib/db';
import { deleteKeys } from '@/lib/r2';

type StoredItem = { id: string; r2_key: string | null; r2_thumb_key: string | null };

/** Safe maintenance: exact binary duplicates are archived; expired archive files are purged. */
export async function maintainLibrary() {
  const sql = db();
  await sql`
    with ranked as (
      select id, row_number() over (partition by content_hash order by created_at, id) as duplicate_number
      from items where content_hash is not null and archived_at is null
    )
    update items set archived_at = now()
    where id in (select id from ranked where duplicate_number > 1)`;

  const expired = await sql`
    select id, r2_key, r2_thumb_key from items
    where archived_at is not null and archived_at < now() - interval '30 days'` as unknown as StoredItem[];
  if (!expired.length) return;

  await deleteKeys(expired.flatMap((item) => [item.r2_key, item.r2_thumb_key].filter(Boolean) as string[]));
  const ids = expired.map((item) => item.id);
  await sql`delete from items where id = any(${ids})`;
}
