import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'OPENAI_API_KEY не настроен' }, { status: 503 });

  const body = await req.json();
  const imageUrl = String(body.imageUrl || '');
  if (!/^https:\/\//i.test(imageUrl)) return NextResponse.json({ error: 'Нужен публичный URL изображения' }, { status: 400 });
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;

  const sql = db();

  // Читаем список бордов из базы, а не из снимка клиента: при пакетной
  // загрузке несколько карточек анализируются почти одновременно, и клиент
  // ещё не успел узнать про борд, который только что создал сосед по
  // батчу — из-за этого вместо одного борда плодилась куча дублей.
  const existingRows = (projectId
    ? await sql`select name from collections where project_id = ${projectId} order by position asc`
    : await sql`select name from collections where project_id is null order by position asc`) as unknown as { name: string }[];
  const existing = existingRows.map((row) => row.name).slice(0, 100);

  // Модель иногда переформулирует имя чуть иначе от вызова к вызову
  // (лишний пробел, другое окончание, другой порядок слов), из-за чего
  // точное сравнение строк на клиенте не находит уже существующий борд
  // и создаёт дубль. Подстраховываемся нечётким сопоставлением по словам.
  const boardWords = (name: string) => name.toLocaleLowerCase().replace(/[«»"'.,:;!?()]/g, ' ').split(/\s+/).filter((w) => w.length >= 4);
  const bestExistingMatch = (name: string): string | null => {
    const words = new Set(boardWords(name));
    if (!words.size) return null;
    let best: { name: string; score: number } | null = null;
    for (const candidate of existing) {
      const candidateWords = new Set(boardWords(candidate));
      if (!candidateWords.size) continue;
      const shared = [...words].filter((w) => candidateWords.has(w)).length;
      const score = shared / Math.min(words.size, candidateWords.size);
      if (score >= 0.5 && (!best || score > best.score)) best = { name: candidate, score };
    }
    return best?.name ?? null;
  };
  await sql`insert into user_stats (id, visits, last_visit, ai_credits) values ('main', 0, null, 100) on conflict (id) do nothing`;
  const reserved = await sql`update user_stats set ai_credits = ai_credits - 1 where id = 'main' and ai_credits > 0 returning ai_credits` as unknown as { ai_credits: number }[];
  if (!reserved.length) return NextResponse.json({ error: 'AI-кредиты закончились', creditsRemaining: 0 }, { status: 402 });

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL || 'gpt-5.6-terra',
      reasoning: { effort: 'low' },
      store: false,
      input: [{
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: `Ты умный куратор визуальной библиотеки. Проанализируй не только предмет на изображении, но и его стиль, назначение, настроение и визуальные признаки. Дай короткое конкретное название на русском (2-6 слов), полезное описание одним предложением, ровно три устойчивых варианта коллекции и 4-6 поисковых тегов. Теги — короткие, в нижнем регистре, без #, без дублей, от общего к конкретному.

Название коллекции — это КАТЕГОРИЯ или ТИП контента, а не описание конкретного кадра: 1-3 слова, например «Худи», «Свитшоты», «Джинсы», «Уличный стиль», «Съёмка продукта». Никогда не копируй в название коллекции текст, заголовок или подпись, видимые на самом изображении (например, надпись «Новая коллекция: каталог женской одежды» с сайта или каталога) — это не название коллекции, а случайный текст в кадре, игнорируй его.

Изображения почти всегда приходят партиями — либо с одной съёмки/кампании (тогда группируй по общему контексту и назначению съёмки, а не по буквальному объекту в кадре — человек в маске, вывеска обменника, турникет, граффити это всё одна съёмка «инсценированное ограбление», а не четыре разные темы), либо это карточки каталога товаров одного типа (тогда группируй по типу товара — 20 разных худи на разных моделях и в разных цветах всё равно одна коллекция «Худи», а не 20 коллекций). В обоих случаях цель — минимум коллекций, каждая эта коллекция объединяет много карточек.

Первым вариантом коллекции — только точное название существующей коллекции, если она хоть сколько-то подходит по категории или смыслу: не создавай новую коллекцию из-за небольшой разницы в формулировке или в деталях конкретного кадра. Новую коллекцию первым вариантом предлагай только если ни одна из существующих объективно не подходит по категории. Никогда не создавай коллекцию под единичный кадр, конкретный товар или мелкую деталь — такое клади в самую близкую по категории существующую коллекцию. Существующие коллекции: ${existing.length ? existing.join(', ') : 'нет'}.`,
          },
          { type: 'input_image', image_url: imageUrl, detail: 'low' },
        ],
      }],
      text: {
        format: {
          type: 'json_schema',
          name: 'image_catalog_analysis',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              collections: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
              tags: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 6 },
            },
            required: ['title', 'description', 'collections', 'tags'],
          },
        },
      },
      max_output_tokens: 420,
    }),
  }).catch(async () => {
    await sql`update user_stats set ai_credits = ai_credits + 1 where id = 'main'`;
    return null;
  });

  if (!response) return NextResponse.json({ error: 'Не удалось связаться с OpenAI', creditsRemaining: Number(reserved[0].ai_credits) + 1 }, { status: 502 });

  const result = await response.json();
  if (!response.ok) {
    await sql`update user_stats set ai_credits = ai_credits + 1 where id = 'main'`;
    const message = result?.error?.message || 'OpenAI не смог проанализировать изображение';
    return NextResponse.json({ error: message, creditsRemaining: Number(reserved[0].ai_credits) + 1 }, { status: response.status });
  }

  const outputText = result.output
    ?.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content || [])
    .find((part: { type?: string }) => part.type === 'output_text')?.text;

  try {
    const parsed = JSON.parse(outputText || '') as { collections?: string[] };
    const existingLower = new Map(existing.map((name) => [name.toLocaleLowerCase(), name]));
    if (Array.isArray(parsed.collections)) {
      parsed.collections = parsed.collections.map((name) => {
        const trimmed = name.trim();
        return existingLower.get(trimmed.toLocaleLowerCase()) || bestExistingMatch(trimmed) || trimmed;
      });
    }
    return NextResponse.json({ ...parsed, creditsRemaining: Number(reserved[0].ai_credits) });
  } catch {
    await sql`update user_stats set ai_credits = ai_credits + 1 where id = 'main'`;
    return NextResponse.json({ error: 'ИИ вернул ответ в неожиданном формате', creditsRemaining: Number(reserved[0].ai_credits) + 1 }, { status: 502 });
  }
}
