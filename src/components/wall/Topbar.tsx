'use client';
import { useState } from 'react';
import Icon from './Icon';
import { useCloseOnEscape } from './useCloseOnEscape';

export type AddKind = 'link' | 'text' | 'callout' | 'html' | 'widget_calendar' | 'widget_weather';

type Crumb = { label: string; onClick?: () => void };

type TopbarProps = {
  onToggleMobileMenu: () => void;
  breadcrumb: Crumb[];
  subtitle: string;
  selectedTag: string | null;
  onClearTag: () => void;

  search: string;
  onSearchChange: (value: string) => void;

  aiMode: 'auto' | 'off';
  aiCredits?: number;
  onToggleAiMode: () => void;
  onTopUpCredits: () => void;

  onPickFiles: () => void;
  onPickKind: (kind: AddKind) => void;
};

/** Топбар: контекстный хлебная крошка вместо голого h1 + бэк-кнопки, поиск —
 * оверлей поверх контента (не толкает соседние кнопки при открытии/закрытии,
 * в отличие от прежнего инлайн-разворота), AI — статус-пилюля (была
 * задумана как пилюля в CSS, но конфликтующее правило где-то по пути
 * растянуло её в кружок — конфликт снят в globals.css). */
export default function Topbar(props: TopbarProps) {
  const {
    onToggleMobileMenu, breadcrumb, subtitle, selectedTag, onClearTag,
    search, onSearchChange,
    aiMode, aiCredits, onToggleAiMode, onTopUpCredits,
    onPickFiles, onPickKind,
  } = props;

  const [searchOpen, setSearchOpen] = useState(false);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  useCloseOnEscape(searchOpen, () => { setSearchOpen(false); onSearchChange(''); });
  useCloseOnEscape(elementMenuOpen, () => setElementMenuOpen(false));

  return (
    <header className="topbar">
      <button className="btn ghost menu-btn" aria-label="Открыть коллекции" onClick={onToggleMobileMenu}>☰</button>
      <div className="title-wrap">
        <div className="topbar-crumbs">
          {breadcrumb.map((crumb, index) => (
            <span key={index}>
              {crumb.onClick ? <button className="topbar-crumb" onClick={crumb.onClick}>{crumb.label}</button> : <b>{crumb.label}</b>}
              {index < breadcrumb.length - 1 && <i>/</i>}
            </span>
          ))}
        </div>
        <p>{subtitle}</p>
      </div>
      {selectedTag && <button className="tag-filter" onClick={onClearTag}>#{selectedTag} ×</button>}

      <div className="topbar-search">
        <button className="icon-control" aria-label="Поиск" aria-expanded={searchOpen} title="Поиск" onClick={() => setSearchOpen((v) => !v)}><Icon name={searchOpen ? 'close' : 'search'} /></button>
        {searchOpen && <>
          <button className="menu-shield" aria-label="Закрыть поиск" onClick={() => { setSearchOpen(false); onSearchChange(''); }} />
          <div className="popover search-popover">
            <input autoFocus value={search} placeholder="Поиск по названию, заметке, тегам" onChange={(event) => onSearchChange(event.target.value)} />
          </div>
        </>}
      </div>

      <button className={'ai-mode-button mode-' + aiMode} aria-pressed={aiMode === 'auto'} disabled={aiCredits === 0}
        aria-label={aiMode === 'auto' ? 'Выключить ИИ' : 'Включить ИИ'} title={aiCredits === 0 ? 'Кредиты закончились' : undefined} onClick={onToggleAiMode}>
        <span>AI</span><small className="ai-credit-tooltip">Осталось {aiCredits ?? '…'} кредитов</small>
      </button>
      {aiCredits === 0 && <button className="btn ghost credits-topup" title="Начислить 100 AI-кредитов" onClick={onTopUpCredits}>+100 кредитов</button>}

      <div className="add-element">
        <button className="btn lime" aria-expanded={elementMenuOpen} onClick={() => setElementMenuOpen((v) => !v)}>＋ Элемент</button>
        {elementMenuOpen && <>
          <button className="menu-shield" aria-label="Закрыть меню" onClick={() => setElementMenuOpen(false)} />
          <div className="element-menu">
            <div className="element-menu-label">Медиа</div>
            <button onClick={() => { setElementMenuOpen(false); onPickFiles(); }}><b>▧</b><span>Фото или видео<small>Загрузить с устройства</small></span></button>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('link'); }}><b>↗</b><span>Ссылка / Embed<small>YouTube, Pinterest и сайты</small></span></button>
            <div className="element-menu-label">Текст</div>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('text'); }}><b>T</b><span>Текст<small>Заметка или описание</small></span></button>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('callout'); }}><b>◉</b><span>Callout<small>Акцент с эмодзи</small></span></button>
            <div className="element-menu-label">Структура</div>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('html'); }}><b>&lt;/&gt;</b><span>HTML<small>Свой код в изолированном блоке</small></span></button>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('widget_calendar'); }}><b>▦</b><span>Календарь<small>Живой виджет с текущей датой</small></span></button>
            <button onClick={() => { setElementMenuOpen(false); onPickKind('widget_weather'); }}><b>☀</b><span>Погода<small>Живой виджет по геолокации</small></span></button>
          </div>
        </>}
      </div>
    </header>
  );
}
