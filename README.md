# embeddd

Коллекции референсов: любая ссылка становится эмбедом, любой файл — карточкой в сетке.

Next.js 15 · Neon Postgres · Cloudflare R2 · Vercel

---

## Запуск, по порядку

### 1. Код в репозиторий

```bash
git clone git@github.com:isashaxxx/embeddd.git
cd embeddd
# распаковать сюда содержимое архива
npm install
git add . && git commit -m "каркас" && git push
```

### 2. База

Vercel → проект `embeddd` → **Storage → Create → Neon**. Vercel сам добавит `DATABASE_URL`
во все окружения. Дальше применить схему:

```bash
npx vercel link          # выбрать проект embeddd
npx vercel env pull .env
node scripts/migrate.mjs
```

### 3. Бакет

Cloudflare → **R2 → Create bucket** → имя `embeddd`.

- **Settings → Public access** → включить `r2.dev` (или повесить свой домен, будет быстрее и без
  ограничения скорости на r2.dev).
- **Settings → CORS policy** → вставить: браузер льёт файлы напрямую, без этого PUT не пройдёт.

```json
[
  {
    "AllowedOrigins": ["https://embeddd.vercel.app", "http://localhost:3000"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

- **R2 → Manage API tokens → Create** с правом *Object Read & Write*. Оттуда Access Key ID и Secret.

### 4. Переменные

Vercel → Settings → Environment Variables (и продублировать в локальный `.env`):

| Переменная | Откуда |
|---|---|
| `APP_PASSWORD` | придумать, это вход в приложение |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `R2_ACCOUNT_ID` | из URL дашборда Cloudflare |
| `R2_ACCESS_KEY_ID` | токен R2 |
| `R2_SECRET_ACCESS_KEY` | токен R2 |
| `R2_BUCKET` | `embeddd` |
| `R2_PUBLIC_URL` | `https://pub-xxxx.r2.dev` без слэша на конце |

`DATABASE_URL` подставит Neon.

### 5. Деплой

```bash
git push        # Vercel соберёт сам
npm run dev     # или локально на localhost:3000
```

### 6. Перенос из локальной версии

В `moodboard.html` нажать «Сохранить копию», в вебе — «Импорт из локалки».
Ссылки и эмбеды переедут. Локальные файлы — нет: они там в base64, их проще перетащить заново.

---

## Как устроено

**Файлы идут мимо сервера.** `/api/upload-url` выдаёт подписанную ссылку, браузер делает PUT
напрямую в R2. Иначе упрёшься в лимит тела запроса у функций Vercel и будешь платить за трафик дважды.

**Картинки жмутся в браузере.** Перед загрузкой каждая проходит через canvas: полная версия
1800px webp, превью 700px. Оригинал с айфона на 8 МБ становится ~300 КБ, в сетке грузится превью.

**Позиции дробные.** При перетаскивании между двумя карточками пишется среднее их позиций —
один UPDATE вместо переиндексации всей стены.

**Ссылки разбираются на сервере.** `parseLink` узнаёт YouTube, Pinterest, Instagram, TikTok, Vimeo,
X, Figma, Spotify. Всё остальное идёт в `unfurl`: сервер тянет страницу и достаёт og:image с og:title,
поэтому обычная закладка выглядит как карточка с превью, а не как серый прямоугольник.

**Удаление отложено на 6 секунд** — за это время можно нажать «Вернуть», и запрос в базу не уйдёт.
Вместе с карточкой чистятся оба ключа в R2.

---

## Что дальше

- **iOS Shortcut.** Новая команда: *Получить содержимое URL* → `https://embeddd.vercel.app/share?url=`
  плюс ввод из share sheet. Тогда из приложения Pinterest: Поделиться → embeddd, и картинка в стене.
  На Android то же самое работает само после «Установить приложение» — `share_target` уже в манифесте.
- **Публичные коллекции.** Добавить `share_token` в `collections` и роут `/c/[token]` — показать
  подборку клиенту, не давая доступ ко всей стене.
- **Поиск.** `tsvector` по `title + note + host`, отдельного индекса хватит на десятки тысяч карточек.
- **Теги** — отдельная таблица вместо одной коллекции на карточку.
