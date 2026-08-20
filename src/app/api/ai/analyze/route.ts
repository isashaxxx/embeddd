import { NextResponse } from 'next/server';

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
  });

  const result = await response.json();
  if (!response.ok) {
    const message = result?.error?.message || 'OpenAI не смог проанализировать изображение';
    return NextResponse.json({ error: message }, { status: response.status });
  }

  const outputText = result.output
    ?.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content || [])
    .find((part: { type?: string }) => part.type === 'output_text')?.text;

  try {
    const parsed = JSON.parse(outputText || '');
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'ИИ вернул ответ в неожиданном формате' }, { status: 502 });
  }
}
