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

  const existing = Array.isArray(body.existingCollections)
    ? body.existingCollections.map(String).slice(0, 100)
    : [];

  const sql = db();
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
            text: `Ты умный куратор визуальной библиотеки. Проанализируй не только предмет на изображении, но и его стиль, назначение, настроение и визуальные признаки. Дай короткое конкретное название на русском (2-6 слов), полезное описание одним предложением, ровно три устойчивых варианта коллекции и 4-6 поисковых тегов. Теги — короткие, в нижнем регистре, без #, без дублей, от общего к конкретному. Сначала предложи наиболее подходящую существующую коллекцию, затем более узкую тему и более широкую тему. Не создавай коллекцию для единичной мелкой детали. Если подходит существующая коллекция, используй её точное название первым вариантом. Существующие коллекции: ${existing.length ? existing.join(', ') : 'нет'}.`,
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
    const parsed = JSON.parse(outputText || '');
    return NextResponse.json({ ...parsed, creditsRemaining: Number(reserved[0].ai_credits) });
  } catch {
    await sql`update user_stats set ai_credits = ai_credits + 1 where id = 'main'`;
    return NextResponse.json({ error: 'ИИ вернул ответ в неожиданном формате', creditsRemaining: Number(reserved[0].ai_credits) + 1 }, { status: 502 });
  }
}
