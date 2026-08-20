'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type Muuri from 'muuri';
import type { Collection, Item } from '@/lib/types';
import { shrink, videoSize } from '@/lib/resize';

type Props = { initialCollections: Collection[]; initialItems: Item[] };
type Active = 'all' | 'fav' | string;
type NewElement = 'link' | 'text' | 'callout' | 'html';
type ElementSize = 'S' | 'M' | 'L';
type TextStyle = Item['text_style'];
type AiSuggestion = { itemId: string; title: string; description: string; collections: string[] };
type AiMode = 'auto' | 'ask' | 'off';

const BLOCK_KINDS = new Set(['text', 'heading', 'callout', 'html', 'divider']);
const isBlock = (item: Item) => BLOCK_KINDS.has(item.kind);
const elementSize = (size: Item['display_size']): ElementSize => size === 'M' ? 'M' : size === 'L' || size === 'XL' ? 'L' : 'S';
const pinCrop = (item: Item) => {
  const numericPosition = Number(item.position);
  const fallback = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = Number.isFinite(numericPosition) ? Math.round(numericPosition) : fallback;
  return (['compact', 'portrait', 'tall'] as const)[Math.abs(seed) % 3];
};

export default function Wall({ initialCollections, initialItems }: Props) {
  const [collections, setCollections] = useState(initialCollections);
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<Active>('all');
  const [editing, setEditing] = useState<Item | null>(null);
  const [collModal, setCollModal] = useState<Collection | 'new' | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elementMenu, setElementMenu] = useState(false);
  const [newElement, setNewElement] = useState<NewElement | null>(null);
  const [aiQueue, setAiQueue] = useState<AiSuggestion[]>([]);
  const [aiRunning, setAiRunning] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>('ask');
  const [aiMenu, setAiMenu] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gridMetrics, setGridMetrics] = useState({ width: 0, columns: 2 });
  const fileRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const selectionIdsRef = useRef<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const muuriRef = useRef<Muuri | null>(null);

  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('embeddd:ai-mode') as AiMode | null;
    if (saved === 'auto' || saved === 'ask' || saved === 'off') setAiMode(saved);
  }, []);

  function chooseAiMode(mode: AiMode) {
    setAiMode(mode);
    setAiMenu(false);
    localStorage.setItem('embeddd:ai-mode', mode);
    say(mode === 'auto' ? 'ИИ будет размещать сам' : mode === 'off' ? 'Автоматический ИИ выключен' : 'ИИ будет спрашивать');
  }

  /* ---------------- данные ---------------- */

  const visible = items.filter((i) =>
    active === 'all' ? true : active === 'fav' ? i.fav : i.collection_id === active
  );

  const countOf = (id: Active) =>
    id === 'all' ? items.length : id === 'fav' ? items.filter((i) => i.fav).length : items.filter((i) => i.collection_id === id).length;

  const targetCollection = () => (active === 'all' || active === 'fav' ? null : active);

  const gridSignature = visible.map((item) => `${item.id}:${isBlock(item) ? elementSize(item.display_size) : 'pin'}`).sort().join('|');

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const width = grid.getBoundingClientRect().width;
      const columns = width >= 1280 ? 6 : width >= 1000 ? 5 : width >= 760 ? 4 : width >= 520 ? 3 : 2;
      setGridMetrics((current) => current.width === width && current.columns === columns ? current : { width, columns });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    measure();
    return () => observer.disconnect();
  }, []);

  // Muuri owns geometry and sorting. React owns content and persistence.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    let pendingOrder: string[] | null = null;

    void import('muuri').then(({ default: MuuriGrid }) => {
      if (cancelled || !grid.isConnected) return;
      const instance = new MuuriGrid(grid, {
        items: '.grid-item',
        dragEnabled: true,
        dragHandle: '.card',
        dragStartPredicate: (item, event) => {
          const target = event.target as HTMLElement | null;
          if (target?.closest('button, select, input, textarea, a, iframe, video, .resize')) return false;
          return MuuriGrid.ItemDrag.defaultStartPredicate(item, event, { distance: 5, delay: 0 });
        },
        dragContainer: document.body,
        layout: { fillGaps: true, horizontal: false, rounding: true },
        layoutDuration: 260,
        layoutEasing: 'ease-out',
        dragSortHeuristics: { sortInterval: 45, minDragDistance: 6, minBounceBackAngle: 1 },
        dragRelease: { duration: 240, easing: 'ease-out', useDragContainer: false },
        dragAutoScroll: { targets: grid.parentElement ? [grid.parentElement] : [], threshold: 80, safeZone: 0.15 },
        dragPlaceholder: {
          enabled: true,
          createElement: () => { const el = document.createElement('div'); el.className = 'grid-placeholder'; return el; },
        },
      });
      muuriRef.current = instance;

      instance.on('dragStart', (item) => {
        const element = item.getElement();
        if (element) {
          element.classList.add('is-grabbed');
        }
        document.body.classList.add('grid-dragging');
      });
      instance.on('dragMove', (_item, event) => {
        document.querySelectorAll('.coll.drop').forEach((el) => el.classList.remove('drop'));
        const underPointer = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        underPointer?.closest<HTMLElement>('[data-collection-drop]')?.classList.add('drop');
      });
      instance.on('dragEnd', (item, event) => {
        item.getElement()?.classList.remove('is-grabbed');
        document.body.classList.remove('grid-dragging');
        document.querySelectorAll('.coll.drop').forEach((el) => el.classList.remove('drop'));
        const id = item.getElement()?.dataset.cardId;
        const underPointer = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        const collectionTarget = underPointer?.closest<HTMLElement>('[data-collection-drop]')?.dataset.collectionDrop;
        if (id && collectionTarget) moveTo(id, collectionTarget);
        else pendingOrder = instance.getItems().map((entry) => entry.getElement()?.dataset.cardId).filter(Boolean) as string[];
      });
      instance.on('dragReleaseEnd', (item) => {
        const element = item.getElement();
        if (!element) return;
        instance.refreshItems([item]).layout();
        if (pendingOrder) {
          const order = pendingOrder;
          pendingOrder = null;
          persistGridOrder(order);
        }
      });

      const relayout = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => instance.refreshItems().layout());
      };
      observer = new ResizeObserver(relayout);
      grid.querySelectorAll<HTMLElement>('.grid-item-content').forEach((item) => observer!.observe(item));
      if (grid.parentElement) observer.observe(grid.parentElement);
      relayout();
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      document.body.classList.remove('grid-dragging');
      muuriRef.current?.destroy();
      muuriRef.current = null;
    };
  }, [gridSignature]);

  function persistGridOrder(ids: string[]) {
    const orderedSet = new Set(ids);
    setItems((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      let cursor = 0;
      return current.map((item) => orderedSet.has(item.id) ? byId.get(ids[cursor++])! : item);
    });
    void fetch('/api/items/reorder', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }),
    });
  }

  async function addLink(url: string) {
    const tempId = 'temp-' + Math.random().toString(36).slice(2);
    const optimistic: Item = {
      id: tempId, collection_id: targetCollection(), kind: 'link', provider: null,
      position: -Infinity, fav: false, url, host: safeHost(url), embed_url: null, embed_h: null,
      ratio: null, src: null, thumb: null, width: null, height: null, r2_key: null,
      r2_thumb_key: null, title: safeHost(url), note: '', display_size: 'M', text_style: 'p',
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

  async function addBlock(kind: Exclude<NewElement, 'link'>, title = '', note = '', textStyle: TextStyle = 'p', displaySize: ElementSize = 'S') {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ block: { kind, title, note, textStyle, displaySize }, collectionId: targetCollection() }),
    });
    if (!res.ok) return say('Блок не создался');
    const item: Item = await res.json();
    setItems((p) => [item, ...p]);
    setNewElement(null);
  }

  function startSelection(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.card, button, input, textarea, select, a')) return;
    const startX = e.clientX, startY = e.clientY;
    const box = selectionBoxRef.current!;
    selectionIdsRef.current = new Set();
    setSelected(new Set());
    box.style.display = 'block';
    box.style.left = startX + 'px'; box.style.top = startY + 'px';
    box.style.width = '0px'; box.style.height = '0px';

    const move = (ev: PointerEvent) => {
      const left = Math.min(startX, ev.clientX), top = Math.min(startY, ev.clientY);
      const right = Math.max(startX, ev.clientX), bottom = Math.max(startY, ev.clientY);
      box.style.left = left + 'px'; box.style.top = top + 'px';
      box.style.width = right - left + 'px'; box.style.height = bottom - top + 'px';
      const hits = new Set<string>();
      document.querySelectorAll<HTMLElement>('.grid-item[data-card-id]').forEach((card) => {
        const r = card.querySelector('.card')!.getBoundingClientRect();
        const hit = r.left < right && r.right > left && r.top < bottom && r.bottom > top;
        card.classList.toggle('selecting', hit);
        if (hit) hits.add(card.dataset.cardId!);
      });
      selectionIdsRef.current = hits;
    };
    const up = () => {
      box.style.display = 'none';
      document.querySelectorAll('.grid-item.selecting').forEach((card) => card.classList.remove('selecting'));
      setSelected(new Set(selectionIdsRef.current));
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  }

  function resizeSelected(size: ElementSize) {
    const ids = [...selected].filter((id) => items.some((item) => item.id === id && isBlock(item)));
    setItems((p) => p.map((item) => ids.includes(item.id) ? { ...item, display_size: size } : item));
    ids.forEach((id) => fetch(`/api/items/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displaySize: size }) }));
  }

  function moveSelected(collectionId: string) {
    if (collectionId === '__none__') collectionId = '';
    const ids = [...selected];
    setItems((p) => p.map((item) => ids.includes(item.id) ? { ...item, collection_id: collectionId || null } : item));
    ids.forEach((id) => fetch(`/api/items/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: collectionId || null }) }));
    setSelected(new Set());
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length || !confirm(`Удалить выбранные карточки (${ids.length})?`)) return;
    setItems((p) => p.filter((item) => !selected.has(item.id)));
    setSelected(new Set());
    await Promise.all(ids.map((id) => fetch(`/api/items/${id}`, { method: 'DELETE' })));
    say('Карточки удалены');
  }

  async function placeAutomatically(item: Item, result: Omit<AiSuggestion, 'itemId'>) {
    const existingOption = result.collections.find((name) => collections.some((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
    const collectionName = existingOption || result.collections[0];
    let collection = collections.find((c) => c.name.toLocaleLowerCase() === collectionName.toLocaleLowerCase());
    if (!collection) {
      const colors = ['#C6F04A', '#FFB86B', '#87CEEB', '#D6B4FC', '#FF8F8F'];
      const res = await fetch('/api/collections', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: collectionName, color: colors[collections.length % colors.length] }),
      });
      if (res.ok) {
        collection = await res.json();
        setCollections((p) => p.some((c) => c.id === collection!.id) ? p : [...p, collection!]);
      }
    }
    await patch(item.id, { title: result.title, note: result.description, collectionId: collection?.id || null });
    say(collection ? `ИИ разместил в «${collection.name}»` : 'ИИ назвал карточку');
  }

  async function analyzeImage(item: Item, manual = false) {
    if (!manual && aiMode === 'off') return;
    if (aiRunning.includes(item.id)) return;
    setAiRunning((p) => [...p, item.id]);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageUrl: item.src || item.thumb, existingCollections: collections.map((c) => c.name) }),
      });
      const result = await res.json();
      if (!res.ok) return say(result.error || 'ИИ-анализ не сработал');
      if (!manual && aiMode === 'auto') await placeAutomatically(item, result);
      else {
        await patch(item.id, { title: result.title });
        setAiQueue((p) => [...p, { itemId: item.id, ...result }]);
      }
    } catch {
      say('Не удалось связаться с ИИ');
    } finally {
      setAiRunning((p) => p.filter((id) => id !== item.id));
    }
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
        if (!isVideo && aiMode !== 'off') void analyzeImage(real);
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
      if (e.key === 'Escape') { setEditing(null); setCollModal(null); setLightbox(null); setNewElement(null); setElementMenu(false); setAiMenu(false); }
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('paste', onPaste); document.removeEventListener('keydown', onKey); };
  });

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (![...(e.dataTransfer?.types || [])].some((t) => t === 'Files' || t === 'text/uri-list')) return;
      dragDepth.current++;
      setDropping(true);
    };
    const leave = () => { if (--dragDepth.current <= 0) { dragDepth.current = 0; setDropping(false); } };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      dragDepth.current = 0; setDropping(false);
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
        <div className="brand"><img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b></div>
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
          <button onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); location.href = '/login'; }}>Выйти</button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" aria-label="Открыть коллекции" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div className="title-wrap">
            <h1>{title}</h1>
            <p>{visible.length} {plural(visible.length, 'карточка', 'карточки', 'карточек')}</p>
          </div>
          <div className="ai-control">
            <button className={'ai-mode-button mode-' + aiMode} aria-expanded={aiMenu} onClick={() => setAiMenu((v) => !v)}>
              <span>AI</span>{aiMode === 'auto' ? 'Размещает сам' : aiMode === 'ask' ? 'Спрашивает' : 'Выключен'}
            </button>
            {aiMenu && <>
              <button className="menu-shield" aria-label="Закрыть меню ИИ" onClick={() => setAiMenu(false)} />
              <div className="ai-mode-menu">
                <button className={aiMode === 'auto' ? 'on' : ''} onClick={() => chooseAiMode('auto')}><b>Размещай сам</b><small>Назвать и сразу разложить по коллекциям</small></button>
                <button className={aiMode === 'ask' ? 'on' : ''} onClick={() => chooseAiMode('ask')}><b>Спрашивай</b><small>Показывать три варианта перед размещением</small></button>
                <button className={aiMode === 'off' ? 'on danger' : 'danger'} onClick={() => chooseAiMode('off')}><b>Выключить ИИ</b><small>Не анализировать новые изображения</small></button>
              </div>
            </>}
          </div>
          <div className="add-element">
            {!!aiRunning.length && <span className="ai-status"><i /> ИИ смотрит {aiRunning.length > 1 ? aiRunning.length : ''}</span>}
            <button className="btn lime" aria-expanded={elementMenu} onClick={() => setElementMenu((v) => !v)}>＋ Элемент</button>
            {elementMenu && <>
              <button className="menu-shield" aria-label="Закрыть меню" onClick={() => setElementMenu(false)} />
              <div className="element-menu">
                <div className="element-menu-label">Добавить на стену</div>
                <button onClick={() => { setElementMenu(false); fileRef.current?.click(); }}><b>▧</b><span>Фото или видео<small>Загрузить с устройства</small></span></button>
                <button onClick={() => { setElementMenu(false); setNewElement('link'); }}><b>↗</b><span>Ссылка / Embed<small>YouTube, Pinterest и сайты</small></span></button>
                <i />
                <button onClick={() => { setElementMenu(false); setNewElement('text'); }}><b>T</b><span>Текст<small>Заметка или описание</small></span></button>
                <button onClick={() => { setElementMenu(false); setNewElement('callout'); }}><b>◉</b><span>Callout<small>Акцент с эмодзи</small></span></button>
                <button onClick={() => { setElementMenu(false); setNewElement('html'); }}><b>&lt;/&gt;</b><span>HTML<small>Свой код в изолированном блоке</small></span></button>
              </div>
            </>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
        </header>

        <div className="scroll" onPointerDown={startSelection}>
          <div ref={gridRef} className="grid">
            {visible.map((it) => {
              const blockSpan = isBlock(it) ? elementSize(it.display_size) === 'L' ? 3 : elementSize(it.display_size) === 'M' ? 2 : 1 : 1;
              const span = Math.min(blockSpan, gridMetrics.columns);
              const itemWidth = gridMetrics.width ? gridMetrics.width * span / gridMetrics.columns : 0;
              return <div key={it.id} className={`grid-item ${isBlock(it) ? `element-item element-size-${elementSize(it.display_size).toLowerCase()}` : 'pin-item'}`} data-card-id={it.id} style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className="grid-item-content"><Card item={it} /></div>
              </div>
            })}
          </div>
          {!visible.length && (
            <div className="empty">
              <h2>Пусто. Кидай сюда всё.</h2>
              <p>Нажми «+ Элемент», перетащи файлы в окно или просто вставь ссылку через <kbd>⌘V</kbd>.</p>
              <p>Карточки таскаются мышкой — между собой и в коллекции слева.</p>
            </div>
          )}
        </div>

        <div className={'dropzone' + (dropping ? ' on' : '')}>Отпусти — положу на стену</div>
        <div ref={selectionBoxRef} className="selection-box" />
      </main>

      {!!selected.size && <div className="selection-bar">
        <b>{selected.size}</b><span>выбрано</span>
        <i />
        {[...selected].some((id) => items.some((item) => item.id === id && isBlock(item))) && <>
          <span>Размер элементов</span>
          <select aria-label="Размер выбранных элементов" defaultValue="S" onChange={(e) => resizeSelected(e.target.value as ElementSize)}>
            <option value="S">S</option><option value="M">M</option><option value="L">L</option>
          </select>
          <i />
        </>}
        <select aria-label="Переместить выбранные" defaultValue="" onChange={(e) => moveSelected(e.target.value)}>
          <option value="" disabled>В коллекцию...</option>
          <option value="__none__">Без коллекции</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="selection-delete" onClick={deleteSelected}>Удалить</button>
        <button aria-label="Снять выделение" onClick={() => setSelected(new Set())}>×</button>
      </div>}

      {editing && <EditModal item={editing} />}
      {collModal && <CollModal />}
      {newElement && <NewElementModal kind={newElement} />}
      {!!aiQueue.length && <AiCollectionModal suggestion={aiQueue[0]} />}
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
        data-collection-drop={id}
        className={'coll' + (active === id ? ' active' : '')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.coll-edit')) return;
          setActive(id); setMenuOpen(false);
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
    const boxRef = useRef<HTMLDivElement>(null);

    const isMedia = item.kind === 'image' || item.kind === 'video';
    const size = elementSize(item.display_size);
    const crop = pinCrop(item);
    return (
      <div
        className={`card ${isBlock(item) ? 'block-card' : 'pin-card'}${selected.has(item.id) ? ' selected' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, iframe, video, .resize')) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || selected.size) {
            e.stopPropagation();
            setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; });
            return;
          }
          if (isMedia) setLightbox(item.id);
          else if (item.url) window.open(item.url, '_blank', 'noopener');
        }}
      >
        {item.kind === 'image' && (
          <img className={`media crop-${crop}`} draggable={false} loading="lazy" decoding="async" src={item.thumb || item.src || ''} alt=""
            style={item.width && item.height ? { aspectRatio: `${item.width}/${item.height}` } : undefined} />
        )}

        {item.kind === 'video' && <video className={`media crop-${crop}`} draggable={false} controls preload="none" src={item.src || ''} />}

        {item.kind === 'embed' && (
          <div ref={boxRef} className="embed-box"
            style={item.ratio ? { aspectRatio: `${(100 / item.ratio).toFixed(4)}` } : { height: (item.embed_h || 480) + 'px' }}>
            {item.thumb && !playing ? (
              <>
                <img className={`media crop-${crop}`} draggable={false} loading="lazy" decoding="async" src={item.thumb} alt=""
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
              <img className={`media crop-${crop}`} draggable={false} loading="lazy" decoding="async" src={item.thumb} alt="" />
              <div className="meta">
                <div className="meta-txt">
                  <div className="t">{item.title || item.host}</div>
                  <div className="n">{item.host}</div>
                </div>
              </div>
            </>
          ) : (
            <div className="link-card">
              <img className="fav" draggable={false} alt="" src={`https://www.google.com/s2/favicons?domain=${item.host}&sz=64`} />
              <h4>{item.title || item.host}</h4>
              <div className="host">{item.host}</div>
            </div>
          )
        )}

        {item.kind === 'text' && createElement(item.text_style === 'p' || !item.text_style ? 'p' : item.text_style, { className: `content-block text-block text-${item.text_style || 'p'}` }, item.note)}
        {item.kind === 'heading' && <h2 className="content-block text-block text-h2">{item.note || item.title}</h2>}
        {item.kind === 'callout' && <div className="content-block callout-block"><span>{item.title || '💡'}</span><p>{item.note}</p></div>}
        {item.kind === 'html' && <div ref={boxRef} className="html-block" style={{ height: (item.embed_h || 280) + 'px' }}><iframe title="HTML-блок" sandbox="allow-scripts" srcDoc={item.note} /></div>}
        {item.kind === 'divider' && <div className="divider-block"><i /></div>}

        {['image', 'video', 'embed'].includes(item.kind) && (item.title || item.note) && (
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
          {item.kind === 'image' && <button className="ai-tool" aria-label="Проанализировать изображение" title="Проанализировать изображение" disabled={aiRunning.includes(item.id)} onClick={(e) => { e.stopPropagation(); analyzeImage(item, true); }}>{aiRunning.includes(item.id) ? '…' : 'AI'}</button>}
          {isBlock(item) && <select className="size-select" aria-label="Размер элемента" title="Размер элемента" value={size} onClick={(e) => e.stopPropagation()} onChange={(e) => patch(item.id, { displaySize: e.target.value as ElementSize })}>
            <option value="S">S</option><option value="M">M</option><option value="L">L</option>
          </select>}
          {item.url && <button aria-label="Открыть оригинал" onClick={(e) => { e.stopPropagation(); window.open(item.url!, '_blank', 'noopener'); }}>↗</button>}
          <button aria-label="Редактировать карточку" onClick={(e) => { e.stopPropagation(); setEditing(item); }}>✎</button>
          <button className="del" aria-label="Удалить карточку" onClick={(e) => { e.stopPropagation(); remove(item); }}>×</button>
        </div>

        <div className="grip" title="Переместить"><span>⠿</span> Переместить</div>

        {(item.kind === 'html' || (item.kind === 'embed' && !item.ratio)) && (
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

  function NewElementModal({ kind }: { kind: NewElement }) {
    const [value, setValue] = useState('');
    const [icon, setIcon] = useState('💡');
    const [textStyle, setTextStyle] = useState<TextStyle>('p');
    const [size, setSize] = useState<ElementSize>('S');
    const names: Record<NewElement, string> = { link: 'Ссылка / Embed', text: 'Текст', callout: 'Callout', html: 'HTML' };
    const submit = () => {
      if (!value.trim()) return;
      if (kind === 'link') { addLink(value.trim()); setNewElement(null); return; }
      addBlock(kind, kind === 'callout' ? icon : '', value, kind === 'text' ? textStyle : 'p', size);
    };
    return (
      <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setNewElement(null); }}>
        <div className="modal element-modal">
          <h3>{names[kind]}</h3>
          {kind === 'callout' && <div className="field icon-field"><label>Иконка</label><input value={icon} maxLength={4} onChange={(e) => setIcon(e.target.value)} /></div>}
          {kind === 'text' && <div className="field"><label>Стиль текста</label><div className="text-style-picker">
            {(['p', 'h1', 'h2', 'h3', 'h4', 'h5'] as TextStyle[]).map((style) => <button key={style} className={textStyle === style ? 'on' : ''} onClick={() => setTextStyle(style)}>{style === 'p' ? 'Текст' : style.toUpperCase()}</button>)}
          </div></div>}
          {kind !== 'link' && <div className="field"><label>Размер элемента</label><select value={size} onChange={(e) => setSize(e.target.value as ElementSize)}>
            <option value="S">S — одна колонка</option><option value="M">M — две колонки</option><option value="L">L — три колонки</option>
          </select></div>}
          <div className="field"><label>{kind === 'link' ? 'URL' : kind === 'html' ? 'Код' : 'Содержание'}</label>
            {kind === 'link' ? <input value={value} autoFocus placeholder="https://…" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              : <textarea value={value} autoFocus rows={kind === 'html' ? 10 : 5} placeholder={kind === 'html' ? '<div>…</div>' : 'Начни писать…'} onChange={(e) => setValue(e.target.value)} />}
          </div>
          <div className="modal-foot"><button className="btn ghost" onClick={() => setNewElement(null)}>Отмена</button><button className="btn" onClick={submit}>Добавить</button></div>
        </div>
      </div>
    );
  }

  function AiCollectionModal({ suggestion }: { suggestion: AiSuggestion }) {
    const [selected, setSelected] = useState(suggestion.collections[0] || '');
    const [name, setName] = useState(suggestion.title);
    const close = () => setAiQueue((p) => p.slice(1));
    const apply = async () => {
      const cleanTitle = name.trim() || suggestion.title;
      await patch(suggestion.itemId, { title: cleanTitle, note: suggestion.description });
      if (selected) {
        let collection = collections.find((c) => c.name.toLocaleLowerCase() === selected.toLocaleLowerCase());
        if (!collection) {
          const colors = ['#C6F04A', '#FFB86B', '#87CEEB', '#D6B4FC', '#FF8F8F'];
          const res = await fetch('/api/collections', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: selected, color: colors[collections.length % colors.length] }),
          });
          if (res.ok) {
            collection = await res.json();
            setCollections((p) => [...p, collection!]);
          }
        }
        if (collection) await patch(suggestion.itemId, { collectionId: collection.id });
      }
      close();
      say(selected ? 'ИИ разложил карточку' : 'Название сохранено');
    };
    return (
      <div className="overlay on ai-overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="modal ai-modal">
          <div className="ai-kicker"><i /> Анализ готов</div>
          <h3>Как назвать и куда положить?</h3>
          <div className="field"><label>Название карточки</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <p className="ai-description">{suggestion.description}</p>
          <div className="field"><label>ИИ предлагает коллекции</label>
            <div className="ai-options">
              {suggestion.collections.map((option) => {
                const exists = collections.some((c) => c.name.toLocaleLowerCase() === option.toLocaleLowerCase());
                return <button key={option} className={selected === option ? 'on' : ''} onClick={() => setSelected(option)}><span>{option}</span><small>{exists ? 'существующая' : 'создать новую'}</small></button>;
              })}
            </div>
          </div>
          <div className="modal-foot"><button className="btn ghost" onClick={close}>Только название</button><button className="btn" onClick={apply}>{selected && !collections.some((c) => c.name.toLocaleLowerCase() === selected.toLocaleLowerCase()) ? 'Создать и переместить' : 'Применить'}</button></div>
        </div>
      </div>
    );
  }

  function EditModal({ item }: { item: Item }) {
    const [t, setT] = useState(item.title || '');
    const [n, setN] = useState(item.note || '');
    const [c, setC] = useState(item.collection_id || '');
    const [size, setSize] = useState<ElementSize>(elementSize(item.display_size));
    const [textStyle, setTextStyle] = useState<TextStyle>(item.text_style || 'p');

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
          {isBlock(item) && <div className="field"><label>Размер элемента</label><select value={size} onChange={(e) => setSize(e.target.value as ElementSize)}>
            <option value="S">S — одна колонка</option><option value="M">M — две колонки</option><option value="L">L — три колонки</option>
          </select></div>}
          {item.kind === 'text' && <div className="field"><label>Стиль текста</label><div className="text-style-picker">
            {(['p', 'h1', 'h2', 'h3', 'h4', 'h5'] as TextStyle[]).map((value) => <button key={value} className={textStyle === value ? 'on' : ''} onClick={() => setTextStyle(value)}>{value === 'p' ? 'Текст' : value.toUpperCase()}</button>)}
          </div></div>}
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn" onClick={() => { patch(item.id, { title: t, note: n, collectionId: c || null, ...(isBlock(item) ? { displaySize: size } : {}), textStyle }); setEditing(null); }}>Сохранить</button>
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
  const map: Record<string, string> = { collectionId: 'collection_id', embedH: 'embed_h', displaySize: 'display_size', textStyle: 'text_style' };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) out[map[k] ?? k] = v;
  return out;
}
