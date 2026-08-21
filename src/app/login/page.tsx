import { db } from '@/lib/db';
import LoginForm from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function Login() {
  let nickname = 'embeddd';
  try {
    const sql = db();
    const rows = (await sql`select nickname from account_profile where id = 'main' limit 1`) as unknown as { nickname: string }[];
    if (rows[0]?.nickname) nickname = rows[0].nickname;
  } catch {}

  return (
    <div className="login-gate">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Sans:wght@400;500&family=JetBrains+Mono:wght@500&display=swap"
      />

      <header className="login-gate__masthead">
        <p className="login-gate__kicker">Личный визуальный архив</p>
        <div className="login-gate__wordmark"><img src="/logo.svg" alt="" /><span>embeddd</span></div>
      </header>

      <main className="login-gate__split">
        <section className="login-gate__intro">
          <h1 className="login-gate__headline">Твой личный архив визуальных идей.</h1>
          <p className="login-gate__lede">
            Приватный инструмент для сбора референсов — фото, видео, ссылок. Раскладывай по проектам и бордам, а нейросеть сама предложит, куда что отнести.
          </p>
          <ul className="login-gate__points">
            <li>Проекты → борды → карточки</li>
            <li>Автоматическая категоризация от ИИ</li>
            <li>Публичная ссылка на избранный проект</li>
          </ul>
          <LoginForm />
        </section>
        <aside className="login-gate__mosaic" aria-hidden="true">
          <i /><i /><i /><i /><i /><i /><i /><i />
        </aside>
      </main>

      <footer className="login-gate__foot">
        <p className="login-gate__foot-close">Твой,<br /><span>— {nickname}</span></p>
      </footer>
    </div>
  );
}
