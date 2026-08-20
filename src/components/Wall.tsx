'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Collection, Item } from '@/lib/types';
import { shrink, videoSize } from '@/lib/resize';

type Props = { initialCollections: Collection[]; initialItems: Item[] };
type Active = 'all' | 'fav' | string;

export default function Wall({ initialCollections, initialItems }: Props) {
  const [collections, setCollections] = useState(initialCollections);
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<Active>('all');
  const [cols, setCols] = useState(4);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<Active | null>(null);
  const [editing, setEditing] = useState<Item | null>(null);
  const [collModal, setCollModal] = useState<Collection | 'new' | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    const saved = Number(localStorage.getItem('embeddd:cols'));
    if (saved >= 2 && saved <= 5) setCols(saved);
  }, []);

  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }, []);

  /* ---------------- данные ---------------- */

  const visible = items.filter((i) =>
    active === 'all' ? true : active === 'fav' ? i.fav : i.collection_id === active
  );

  const countOf = (id: Active) =>
    id === 'all' ? items.length : id === 'fav' ? items.filter((i) => i.fav).length : items.filter((i) => i.collection_id === id).length;

  const targetCollection = () => (active === 'all' || active === 'fav' ? null : active);

  async function addLink(url: string) {
    const tempId = 'temp-' + Math.random().toString(36).slice(2);
    const optimistic: Item = {
      id: tempId, collection_id: targetCollection(), kind: 'link', provider: null,
      position: -Infinity, fav: false, url, host: safeHost(url), embed_url: null, embed_h: null,
      ratio: null, src: null, thumb: null, width: null, height: null, r2_key: null,
      r2_thumb_key: null, title: safeHost(url), note: '',
    };
    setItems((p) => [optimistic, ...p]);

    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url, collectionId: targetCollection() }),
    });
    if (!res.ok) {
      setItems((p) => p.filter((i) => i.id !== tempId));
      say('Ссылка не зашла');
      return;
    }
    const real: Item = await res.json();
    setItems((p) => p.map((i) => (i.id === tempId ? real : i)));
  }

  async function addFiles(files: File[]) {
    const list = files.filter((f) => /^(image|video)\//.test(f.type));
    if (!list.length) return say('Нужны картинки или видео');

    setUpload({ done: 0, total: list.length });
    for (let n = 0; n < list.length; n++) {
      const file = list[n];
      try {
        const isVideo = file.type.startsWith('video');
        let body: Blob = file;
        let thumbBlob: Blob | null = null;
        let width = 0, height = 0;
        let ext = file.name.split('.').pop() || 'bin';
        let contentType = file.type;

        if (!isVideo) {
          const full = await shrink(file, 1800);
          const thumb = await shrink(file, 700, 0.75);
          body = full.blob; thumbBlob = thumb.blob;
          width = full.width; height = full.height;
          ext = 'webp'; contentType = 'image/webp';
        } else {
          const d = await videoSize(file);
          width = d.width; height = d.height;
        }

        const signed = await (
          await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ext, contentType, withThumb: !isVideo }),
          })
        ).json();

        await fetch(signed.putUrl, { method: 'PUT', body, headers: { 'content-type': contentType } });
        if (thumbBlob && signed.thumbPutUrl)
          await fetch(signed.thumbPutUrl, { method: 'PUT', body: thumbBlob, headers: { 'content-type': 'image/webp' } });

        const res = await fetch('/api/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            collectionId: targetCollection(),
            upload: {
              kind: isVideo ? 'video' : 'image',
              key: signed.key, thumbKey: signed.thumbKey,
              src: signed.src, thumb: signed.thumb ?? signed.src,
              width, height, title: file.name.replace(/\.[^.]+$/, ''),
            },
          }),
        });
        const real: Item = await res.json();
        setItems((p) => [real, ...p]);
      } catch {
        say('Файл не загрузился: ' + file.name);
      }
      setUpload({ done: n + 1, total: list.length });
    }
    setUpload(null);
    say(list.length + ' в стене');
  }

  async function patch(id: string, data: Partial<Record<string, unknown>>) {
    setItems((p) => p.map((i) => (i.id === id ? ({ ...i, ...camelToSnake(data) } as Item) : i)));
    await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async function remove(item: Item) {
    const idx = items.findIndex((i) => i.id === item.id);
    setItems((p) => p.filter((i) => i.id !== item.id));
    let cancelled = false;

    say('Удалено', () => {
      cancelled = true;
      setItems((p) => {
        const next = [...p];
        next.splice(idx, 0, item);
        return next;
      });
    });

    setTimeout(() => {
      if (!cancelled) fetch(`/api/items/${item.id}`, { method: 'DELETE' });
    }, 6000);
  }

  /* ---------------- перестановка ---------------- */

  function reorder(fromId: string, toId: string, after: boolean) {
    const list = [...items];
    const from = list.findIndex((i) => i.id === fromId);
    const to = list.findIndex((i) => i.id === toId);
    if (from < 0 || to < 0) return;

    const moved = list.splice(from, 1)[0];
    const at = list.findIndex((i) => i.id === toId) + (after ? 1 : 0);
    list.splice(at, 0, moved);

    // дробная позиция между соседями — переиндексировать всю стену не надо
    const prev = list[at - 1]?.position ?? Number(list[at + 1]?.position ?? 0) - 2;
    const next = list[at + 1]?.position ?? Number(prev) + 2;
    const position = (Number(prev) + Number(next)) / 2;
    moved.position = position;

    const collectionId = active === 'all' || active === 'fav' ? moved.collection_id : active;
    moved.collection_id = collectionId;

    setItems(list);
    fetch(`/api/items/${fromId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position, collectionId }),
    });
  }

  function moveTo(itemId: string, target: Active) {
    const it = items.find((i) => i.id === itemId);
    if (!it) return;
    if (target === 'fav') {
      patch(itemId, { fav: true });
      say('В избранном');
      return;
    }
    const collectionId = target === 'all' ? null : target;
    patch(itemId, { collectionId });
    say(target === 'all' ? 'Вынуто из коллекции' : 'Перенесено');
  }

  /* ---------------- коллекции ---------------- */

  async function saveCollection(name: string, color: string) {
    if (collModal === 'new') {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
      const c: Collection = await res.json();
      setCollections((p) => [...p, c]);
      setActive(c.id);
    } else if (collModal) {
      const id = collModal.id;
      setCollections((p) => p.map((c) => (c.id === id ? { ...c, name, color } : c)));
      fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, color }),
      });
    }
    setCollModal(null);
  }

  async function deleteCollection(c: Collection) {
    if (!confirm(`Удалить «${c.name}»? Карточки останутся во «Всём».`)) return;
    setCollections((p) => p.filter((x) => x.id !== c.id));
    setItems((p) => p.map((i) => (i.collection_id === c.id ? { ...i, collection_id: null } : i)));
    if (active === c.id) setActive('all');
    setCollModal(null);
    await fetch(`/api/collections/${c.id}`, { method: 'DELETE' });
  }

  /* ---------------- ввод ---------------- */

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.matches?.('input, textarea')) return;
      const files = [...(e.clipboardData?.files || [])];
      if (files.length) { e.preventDefault(); addFiles(files); return; }
      const txt = (e.clipboardData?.getData('text') || '').trim();
      if (/^https?:\/\/|^www\./i.test(txt)) { e.preventDefault(); addLink(txt); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setEditing(null); setCollModal(null); setLightbox(null); }
      if (e.key === '/' && !(e.target as HTMLElement)?.matches?.('input, textarea')) {
        e.preventDefault();
        (document.getElementById('paste') as HTMLInputElement)?.focus();
      }
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('paste', onPaste); document.removeEventListener('keydown', onKey); };
  });

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (dragId) return;
      if (![...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list')) return;
      dragDepth.current++;
      setDropping(true);
    };
    const leave = () => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDropping(false); } };
    const over = (e: DragEvent) => { if (!dragId) e.preventDefault(); };
    const drop = (e: DragEvent) => {
      dragDepth.current = 0; setDropping(false);
      if (dragId) return;
      e.preventDefault();
      const files = [...(e.dataTransfer?.files || [])];
      if (files.length) return addFiles(files);
      const uri = e.dataTransfer?.getData('text/uri-list') || e.dataTransfer?.getData('text');
      if (uri) addLink(uri.split('\n')[0]);
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  });

  /* ---------------- разметка ---------------- */

  const title = active === 'all' ? 'Всё' : active === 'fav' ? 'Избранное' : collections.find((c) => c.id === active)?.name ?? 'Всё';

  return (
    <div className="app">
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <div className="brand"><b>embeddd</b><span>refs</span></div>
        <div className="nav">
          <NavRow id="all" name="Всё" count={countOf('all')} />
          <NavRow id="fav" name="Избранное" count={countOf('fav')} />
          <div className="nav-label">Коллекции</div>
          {collections.map((c) => (
            <NavRow key={c.id} id={c.id} name={c.name} color={c.color} count={countOf(c.id)} coll={c} />
          ))}
          <button className="add-coll" onClick={() => setCollModal('new')}>
            <span style={{ fontSize: 15 }}>＋</span> Новая коллекция
          </button>
        </div>
        <div className="side-foot">
          <button onClick={() => importRef.current?.click()}>Импорт из локалки</button>
          <button onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); location.href = '/login'; }}>Выйти</button>
          <input ref={importRef} type="file" accept="application/json" hidden onChange={onImport} />
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" aria-label="Открыть коллекции" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div className="title-wrap">
            <h1>{title}</h1>
            <p>{visible.length} {plural(visible.length, 'карточка', 'карточки', 'карточек')}</p>
          </div>
          <div className="paste">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19" />
            </svg>
            <input
              id="paste"
              placeholder="Вставь ссылку и нажми Enter"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const v = (e.target as HTMLInputElement).value.trim();
                if (!v) return;
                v.split(/\s+/).forEach(addLink);
                (e.target as HTMLInputElement).value = '';
              }}
            />
          </div>
          <div className="seg">
            {[2, 3, 4, 5].map((n) => (
              <button key={n} className={cols === n ? 'on' : ''} onClick={() => { setCols(n); localStorage.setItem('embeddd:cols', String(n)); }}>{n}</button>
            ))}
          </div>
          <button className="btn lime" onClick={() => fileRef.current?.click()}>＋ Файлы</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
        </header>

        <div className="scroll">
          <div className="grid" style={{ columnCount: cols }}>
            {visible.map((it) => (
              <Card key={it.id} item={it} />
            ))}
          </div>
          {!visible.length && (
            <div className="empty">
              <h2>Пусто. Кидай сюда всё.</h2>
              <p>Перетащи файлы в окно, вставь ссылку через <kbd>⌘V</kbd> или из поля сверху.</p>
              <p>Карточки таскаются мышкой — между собой и в коллекции слева.</p>
            </div>
          )}
        </div>

        <div className={'dropzone' + (dropping ? ' on' : '')}>Отпусти — положу на стену</div>
      </main>

      {editing && <EditModal item={editing} />}
      {collModal && <CollModal />}
      {lightbox && <Lightbox />}

      {upload && (
        <div className="upload-bar">
          Загружаю {upload.done}/{upload.total}
          <span className="bar"><i style={{ width: `${(upload.done / upload.total) * 100}%` }} /></span>
        </div>
      )}

      <div className={'toast' + (toast ? ' on' : '')}>
        <span>{toast?.msg}</span>
        {toast?.undo && <button onClick={() => { toast.undo!(); setToast(null); }}>Вернуть</button>}
      </div>
    </div>
  );

  /* ---------------- вложенные компоненты ---------------- */

  function NavRow({ id, name, color, count, coll }: { id: Active; name: string; color?: string; count: number; coll?: Collection }) {
    return (
      <div
        className={'coll' + (active === id ? ' active' : '') + (dropTarget === id ? ' drop' : '')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.coll-edit')) return;
          setActive(id); setMenuOpen(false);
        }}
        onDragOver={(e) => { if (!dragId) return; e.preventDefault(); setDropTarget(id); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          setDropTarget(null);
          if (!dragId) return;
          e.preventDefault(); e.stopPropagation();
          moveTo(dragId, id);
        }}
      >
        <span className="coll-dot" style={color ? { background: color } : undefined} />
        <span className="coll-name">{name}</span>
        <span className="coll-count">{count}</span>
        {coll && <button className="coll-edit" onClick={() => setCollModal(coll)}>⋯</button>}
      </div>
    );
  }

  function Card({ item }: { item: Item }) {
    const [playing, setPlaying] = useState(false);
    const [edge, setEdge] = useState<'' | 'before' | 'after'>('');
    const boxRef = useRef<HTMLDivElement>(null);

    const isMedia = item.kind === 'image' || item.kind === 'video';

    return (
      <div
        className={'card' + (dragId === item.id ? ' dragging' : '') + (edge ? ` insert-${edge}` : '')}
        draggable
        onDragStart={() => setDragId(item.id)}
        onDragEnd={() => { setDragId(null); setEdge(''); }}
        onDragOver={(e) => {
          if (!dragId || dragId === item.id) return;
          e.preventDefault(); e.stopPropagation();
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setEdge(e.clientY > r.top + r.height / 2 ? 'after' : 'before');
        }}
        onDragLeave={() => setEdge('')}
        onDrop={(e) => {
          if (!dragId || dragId === item.id) return;
          e.preventDefault(); e.stopPropagation();
          reorder(dragId, item.id, edge === 'after');
          setEdge('');
        }}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, iframe, video, .resize')) return;
          if (isMedia) setLightbox(item.id);
          else if (item.url) window.open(item.url, '_blank', 'noopener');
        }}
      >
        {item.kind === 'image' && (
          <img className="media" loading="lazy" src={item.thumb || item.src || ''} alt=""
            style={item.width && item.height ? { aspectRatio: `${item.width}/${item.height}` } : undefined} />
        )}

        {item.kind === 'video' && <video className="media" controls preload="metadata" src={item.src || ''} />}

        {item.kind === 'embed' && (
          <div ref={boxRef} className="embed-box"
            style={item.ratio ? { aspectRatio: `${(100 / item.ratio).toFixed(4)}` } : { height: (item.embed_h || 480) + 'px' }}>
            {item.thumb && !playing ? (
              <>
                <img className="media" loading="lazy" src={item.thumb} alt=""
                  style={{ position: 'absolute', inset: 0, height: '100%', objectFit: 'cover' }} />
                <button className="play" onClick={(e) => { e.stopPropagation(); setPlaying(true); }}><i /></button>
              </>
            ) : (
              <iframe src={item.embed_url || ''} loading="lazy"
                allow="autoplay; encrypted-media; picture-in-picture; clipboard-write" allowFullScreen />
            )}
          </div>
        )}

        {item.kind === 'link' && (
          item.thumb ? (
            <>
              <img className="media" loading="lazy" src={item.thumb} alt="" />
              <div className="meta">
                <div className="meta-txt">
                  <div className="t">{item.title || item.host}</div>
                  <div className="n">{item.host}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="link-card">
              <img className="fav" alt="" src={`https://www.google.com/s2/favicons?domain=${item.host}&sz=64`} />
              <h4>{item.title || item.host}</h4>
              <div className="host">{item.host}</div>
            </div>
          )
        )}

        {item.kind !== 'link' && (item.title || item.note) && (
          <div className="meta">
            <div className="meta-txt">
              {item.title && <div className="t">{item.title}</div>}
              {item.note && <div className="n">{item.note}</div>}
            </div>
            {item.provider && item.provider !== 'local' && <span className="chip">{item.provider}</span>}
          </div>
        )}

        <button className={'star' + (item.fav ? ' on' : '')} aria-label={item.fav ? 'Убрать из избранного' : 'Добавить в избранное'}
          onClick={(e) => { e.stopPropagation(); patch(item.id, { fav: !item.fav }); }}>
          {item.fav ? '★' : '☆'}
        </button>

        <div className="tools">
          {item.url && <button aria-label="Открыть оригинал" onClick={(e) => { e.stopPropagation(); window.open(item.url!, '_blank', 'noopener'); }}>↗</button>}
          <button aria-label="Редактировать карточку" onClick={(e) => { e.stopPropagation(); setEditing(item); }}>✎</button>
          <button className="del" aria-label="Удалить карточку" onClick={(e) => { e.stopPropagation(); remove(item); }}>×</button>
        </div>

        <div className="grip">⋮⋮</div>

        {item.kind === 'embed' && !item.ratio && (
          <div className="resize" onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            const box = boxRef.current!;
            const startY = e.clientY, startH = box.offsetHeight;
            const move = (ev: PointerEvent) => { box.style.height = Math.max(140, startH + ev.clientY - startY) + 'px'; };
            const up = () => {
              patch(item.id, { embedH: box.offsetHeight });
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }} />
        )}
      </div>
    );
  }

  function EditModal({ item }: { item: Item }) {
    const [t, setT] = useState(item.title || '');
    const [n, setN] = useState(item.note || '');
    const [c, setC] = useState(item.collection_id || '');

    return (
      <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
        <div className="modal">
          <h3>Карточка</h3>
          <div className="field"><label>Название</label>
            <input value={t} autoFocus onChange={(e) => setT(e.target.value)} /></div>
          <div className="field"><label>Заметка</label>
            <textarea value={n} placeholder="Зачем сохранил, что нравится" onChange={(e) => setN(e.target.value)} /></div>
          <div className="field"><label>Коллекция</label>
            <select value={c} onChange={(e) => setC(e.target.value)}>
              <option value="">— без коллекции —</option>
              {collections.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select></div>
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn" onClick={() => { patch(item.id, { title: t, note: n, collectionId: c || null }); setEditing(null); }}>Сохранить</button>
          </div>
        </div>
      </div>
    );
  }

  function CollModal() {
    const c = collModal === 'new' ? null : (collModal as Collection);
    const [name, setName] = useState(c?.name || '');
    const [color, setColor] = useState(c?.color || '#C6F04A');

    return (
      <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setCollModal(null); }}>
        <div className="modal">
          <h3>{c ? 'Коллекция' : 'Новая коллекция'}</h3>
          <div className="field"><label>Название</label>
            <input value={name} autoFocus placeholder="Упаковка / Лендинги / Съёмки"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && saveCollection(name.trim(), color)} /></div>
          <div className="field"><label>Цвет метки</label>
            <input type="color" value={color} style={{ height: 38, padding: 3 }} onChange={(e) => setColor(e.target.value)} /></div>
          <div className="modal-foot">
            {c && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => deleteCollection(c)}>Удалить</button>}
            <button className="btn ghost" onClick={() => setCollModal(null)}>Отмена</button>
            <button className="btn" onClick={() => name.trim() && saveCollection(name.trim(), color)}>{c ? 'Сохранить' : 'Создать'}</button>
          </div>
        </div>
      </div>
    );
  }

  function Lightbox() {
    const list = visible.filter((i) => i.kind === 'image' || i.kind === 'video');
    const idx = list.findIndex((i) => i.id === lightbox);
    const it = list[idx];
    if (!it) return null;
    const go = (d: number) => setLightbox(list[(idx + d + list.length) % list.length].id);

    return (
      <div className="lb on" onClick={(e) => { if (e.target === e.currentTarget) setLightbox(null); }}>
        <button className="lb-x" onClick={() => setLightbox(null)}>✕</button>
        <button className="lb-arrow l" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
        <button className="lb-arrow r" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
        {it.kind === 'video'
          ? <video src={it.src || ''} controls autoPlay />
          : <img src={it.src || it.thumb || ''} alt="" />}
        <div className="lb-cap">{it.title} · {idx + 1}/{list.length}</div>
      </div>
    );
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const res = await fetch('/api/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: await f.text() });
    const r = await res.json();
    if (!res.ok) return say(r.error || 'Файл не читается');
    say(`Перенесено ${r.added}, пропущено локальных файлов: ${r.skipped}`);
    const st = await (await fetch('/api/state')).json();
    setCollections(st.collections);
    setItems(st.items);
  }
}

/* ---------------- мелочи ---------------- */

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 100;
  if (m >= 11 && m <= 14) return c;
  const k = n % 10;
  return k === 1 ? a : k >= 2 && k <= 4 ? b : c;
}

function safeHost(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function camelToSnake(data: Record<string, unknown>) {
  const map: Record<string, string> = { collectionId: 'collection_id', embedH: 'embed_h' };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[map[k] ?? k] = v;
  return out;
}
