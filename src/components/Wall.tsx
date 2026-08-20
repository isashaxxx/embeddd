'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type Muuri from 'muuri';
import type { Account, Collection, Item, Progress, Project } from '@/lib/types';
import { shrink, videoPreview, videoSize } from '@/lib/resize';

type Props = { initialProjects: Project[]; initialCollections: Collection[]; initialItems: Item[]; initialActive?: string; initialProject?: string; initialPost?: string };
type Active = 'all' | 'fav' | string;
type NewElement = 'link' | 'text' | 'callout' | 'html';
type ElementSize = 'S' | 'M' | 'L';
type TextStyle = Item['text_style'];
type AiSuggestion = { title: string; description: string; collections: string[]; tags: string[] };
type AiMode = 'auto' | 'off';

const BLOCK_KINDS = new Set(['text', 'heading', 'callout', 'html', 'divider']);
const isBlock = (item: Item) => BLOCK_KINDS.has(item.kind);
const elementSize = (size: Item['display_size']): ElementSize => size === 'M' ? 'M' : size === 'L' || size === 'XL' ? 'L' : 'S';
const pinCrop = (item: Item) => {
  const numericPosition = Number(item.position);
  const fallback = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = Number.isFinite(numericPosition) ? Math.round(numericPosition) : fallback;
  return (['compact', 'portrait', 'tall'] as const)[Math.abs(seed) % 3];
};

export default function Wall({ initialProjects, initialCollections, initialItems, initialActive = 'all', initialProject = 'all', initialPost }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [collections, setCollections] = useState(initialCollections);
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<Active>(initialActive);
  const [editing, setEditing] = useState<Item | null>(null);
  const [disposing, setDisposing] = useState<Item | null>(null);
  const [collModal, setCollModal] = useState<Collection | 'new' | null>(null);
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null);
  const [activeProject, setActiveProject] = useState<string>(initialProject);
  const [lightbox, setLightbox] = useState<string | null>(() => initialPost ? initialItems.find((item) => item.slug === initialPost || item.id === initialPost)?.id || null : null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draggingBoard, setDraggingBoard] = useState<string | null>(null);
  const [projectDrop, setProjectDrop] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [feedOrder, setFeedOrder] = useState<'newest' | 'oldest'>('newest');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [elementMenu, setElementMenu] = useState(false);
  const [newElement, setNewElement] = useState<NewElement | null>(null);
  const [aiRunning, setAiRunning] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>('auto');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gridMetrics, setGridMetrics] = useState({ width: 0, columns: 2 });
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const topSearchRef = useRef<HTMLDivElement>(null);
  const dragResetTimer = useRef<number | null>(null);
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const selectionIdsRef = useRef<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const muuriRef = useRef<Muuri | null>(null);

  const say = useCallback((msg: string, undo?: () => void) => {
    setToast({ msg, undo });
    setTimeout(() => setToast(null), undo ? 6000 : 2200);
  }, []);

  const taggedCount = items.filter((item) => item.tags?.length).length;
  useEffect(() => {
    let cancelled = false;
    void fetch('/api/progress').then((response) => response.json()).then((next: Progress) => {
      if (cancelled) return;
      setProgress(next);
      const unlocked = next.achievements.find((achievement) => next.newlyUnlocked.includes(achievement.key));
      if (unlocked) say(`${unlocked.icon} Награда: ${unlocked.title} · +${unlocked.xp} XP`);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [items.length, collections.length, taggedCount, say]);

  useEffect(() => { void fetch('/api/account').then((response) => response.json()).then(setAccount).catch(() => {}); }, []);

  useEffect(() => {
    const saved = localStorage.getItem('embeddd:ai-mode');
    setAiMode(saved === 'off' ? 'off' : 'auto');
  }, []);

  function chooseAiMode(mode: AiMode) {
    setAiMode(mode);
    localStorage.setItem('embeddd:ai-mode', mode);
    say(mode === 'auto' ? 'ИИ включён — всё сделает сам' : 'ИИ выключен');
  }

  /* ---------------- данные ---------------- */

  const projectCollections = activeProject === 'all' ? collections : collections.filter((c) => c.project_id === activeProject);
  const projectCollectionIds = new Set(projectCollections.map((c) => c.id));
  const visible = items.filter((i) => {
    const inSection = active === 'archive' ? !!i.archived_at : !i.archived_at && (active === 'all' ? true : active === 'fav' ? i.fav : i.collection_id === active);
    const inProject = activeProject === 'all' || (!!i.collection_id && projectCollectionIds.has(i.collection_id));
    const haystack = `${i.title} ${i.note} ${(i.tags || []).join(' ')}`.toLocaleLowerCase();
    return inSection && inProject && (!selectedTag || i.tags?.includes(selectedTag)) && (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase()));
  });

  const feedEntries: ({ type: 'item'; value: Item } | { type: 'collection'; value: Collection })[] = active === 'all'
    ? [
        ...visible.map((value) => ({ type: 'item' as const, value })),
        ...(!selectedTag ? projectCollections.map((value) => ({ type: 'collection' as const, value })) : []),
      ].sort((a, b) => {
        const aTime = a.value.created_at ? new Date(a.value.created_at).getTime() : a.value.id.startsWith('temp-') ? Date.now() : 0;
        const bTime = b.value.created_at ? new Date(b.value.created_at).getTime() : b.value.id.startsWith('temp-') ? Date.now() : 0;
        return feedOrder === 'newest' ? bTime - aTime : aTime - bTime;
      })
    : visible.map((value) => ({ type: 'item' as const, value }));

  const countOf = (id: Active) =>
    id === 'all' ? items.filter((i) => !i.archived_at).length : id === 'fav' ? items.filter((i) => i.fav && !i.archived_at).length : id === 'archive' ? items.filter((i) => i.archived_at).length : items.filter((i) => i.collection_id === id && !i.archived_at).length;

  const targetCollection = () => (active === 'all' || active === 'fav' ? null : active);

  const gridSignature = [
    ...feedEntries.map((entry) => entry.type === 'item'
      ? `${entry.value.id}:${isBlock(entry.value) ? elementSize(entry.value.display_size) : 'pin'}`
      : `board:${entry.value.id}`),
  ].join('|');

  useEffect(() => {
    if (!searchOpen) return;
    const close = (event: PointerEvent) => {
      if (!topSearchRef.current?.contains(event.target as Node)) { setSearchOpen(false); setSearch(''); }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [searchOpen]);

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
        dragEnabled: moveMode,
        dragHandle: null,
        dragStartPredicate: (item, event) => {
          if (item.getElement()?.classList.contains('collection-board-item')) return false;
          const target = event.target as HTMLElement | null;
          if (target?.closest('button, select, input, textarea, a, iframe, video, .resize')) return false;
          return MuuriGrid.ItemDrag.defaultStartPredicate(item, event, { distance: 5, delay: 0 });
        },
        dragContainer: document.body,
        layout: { fillGaps: true, horizontal: false, rounding: true },
        layoutDuration: moveMode ? 180 : 0,
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
  }, [gridSignature, moveMode]);

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
      id: tempId, slug: tempId, collection_id: targetCollection(), kind: 'link', provider: null,
      position: -Infinity, fav: false, url, host: safeHost(url), embed_url: null, embed_h: null,
      ratio: null, src: null, thumb: null, width: null, height: null, r2_key: null,
      r2_thumb_key: null, title: safeHost(url), note: '', display_size: 'M', text_style: 'p',
      tags: [], archived_at: null, content_hash: null, created_at: new Date().toISOString(),
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
    if (e.pointerType !== 'mouse') return;
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

  async function placeAutomatically(item: Item, result: AiSuggestion) {
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
    await patch(item.id, { title: result.title, note: result.description, tags: result.tags, collectionId: collection?.id || null });
    say(collection ? `ИИ разместил в «${collection.name}»` : 'ИИ назвал карточку');
  }

  async function analyzeImage(item: Item, manual = false) {
    if (aiMode === 'off') {
      if (manual) say('ИИ выключен');
      return;
    }
    if (aiRunning.includes(item.id)) return;
    setAiRunning((p) => [...p, item.id]);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageUrl: item.src || item.thumb, existingCollections: collections.map((c) => c.name) }),
      });
      const result = await res.json();
      if (typeof result.creditsRemaining === 'number') setProgress((current) => current ? { ...current, aiCredits: result.creditsRemaining } : current);
      if (!res.ok) return say(result.error || 'ИИ-анализ не сработал');
      await placeAutomatically(item, result);
    } catch {
      say('Не удалось связаться с ИИ');
    } finally {
      setAiRunning((p) => p.filter((id) => id !== item.id));
    }
  }

  async function addFiles(files: File[]) {
    const list = files.filter((f) => /^(image|video)\//.test(f.type) && f.size <= 250 * 1024 * 1024);
    const oversized = files.length - list.length;
    if (oversized) say(`${oversized} файл не добавлен: максимум 250 МБ`);
    if (!list.length) return say('Нужны картинки или видео');
    const destination = targetCollection();

    setUpload({ done: 0, total: list.length });
    let succeeded = 0;
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
          try {
            const full = await shrink(file, 1800);
            const thumb = await shrink(file, 700, 0.75);
            body = full.blob; thumbBlob = thumb.blob;
            width = full.width; height = full.height;
            ext = 'webp'; contentType = 'image/webp';
          } catch {
            body = file;
            thumbBlob = null;
          }
        } else {
          try {
            const preview = await videoPreview(file);
            thumbBlob = preview.blob; width = preview.width; height = preview.height;
          } catch {
            const d = await videoSize(file);
            width = d.width; height = d.height;
          }
        }

        const signedResponse = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ext, contentType, withThumb: !!thumbBlob }),
          });
        if (!signedResponse.ok) throw new Error((await signedResponse.json().catch(() => null))?.error || 'Не удалось подготовить загрузку');
        const signed = await signedResponse.json();
        if (!signed.putUrl || !signed.src) throw new Error('Хранилище не вернуло адрес загрузки');

        const fullUpload = await fetch(signed.putUrl, { method: 'PUT', body, headers: { 'content-type': contentType } });
        if (!fullUpload.ok) throw new Error(`Хранилище отклонило файл (${fullUpload.status})`);
        if (thumbBlob && signed.thumbPutUrl) {
          const thumbUpload = await fetch(signed.thumbPutUrl, { method: 'PUT', body: thumbBlob, headers: { 'content-type': 'image/webp' } });
          if (!thumbUpload.ok) throw new Error(`Не загрузилось превью (${thumbUpload.status})`);
        }

        const contentHash = body.size <= 64 * 1024 * 1024
          ? [...new Uint8Array(await crypto.subtle.digest('SHA-256', await body.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, '0')).join('')
          : null;
        const res = await fetch('/api/items', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            collectionId: destination,
            upload: {
              kind: isVideo ? 'video' : 'image',
              key: signed.key, thumbKey: signed.thumbKey,
              src: signed.src, thumb: signed.thumb ?? signed.src,
              width, height, title: file.name.replace(/\.[^.]+$/, ''),
              contentHash,
            },
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Карточка не создалась');
        const real: Item = await res.json();
        setItems((p) => [real, ...p]);
        succeeded++;
        if (!isVideo && aiMode !== 'off') void analyzeImage(real);
      } catch (error) {
        say(`${file.name}: ${error instanceof Error ? error.message : 'файл не загрузился'}`);
      }
      setUpload({ done: n + 1, total: list.length });
    }
    setUpload(null);
    if (succeeded) say(`${succeeded} ${succeeded === 1 ? 'файл добавлен' : 'файла добавлено'}`);
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
    try {
      const response = await fetch(`/api/items/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('delete failed');
      say('Карточка удалена');
    } catch {
      setItems((p) => {
        const next = [...p];
        next.splice(idx, 0, item);
        return next;
      });
      say('Не удалось удалить карточку');
    }
  }

  async function archiveItem(item: Item) {
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, archived_at: new Date().toISOString() } : value));
    setDisposing(null);
    await fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: true }) });
    say('Карточка в архиве на 30 дней');
  }

  async function restoreItem(item: Item) {
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, archived_at: null } : value));
    await fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archived: false }) });
    say('Карточка восстановлена');
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

  async function saveCollection(name: string, color: string, accessMode: Collection['access_mode'], projectId: string | null) {
    if (collModal === 'new') {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, color, accessMode, projectId }),
      });
      const c: Collection = await res.json();
      setCollections((p) => [...p, c]);
      setActive('all');
    } else if (collModal) {
      const id = collModal.id;
      const res = await fetch(`/api/collections/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, color, accessMode, projectId }),
      });
      const updated: Collection = await res.json();
      setCollections((p) => p.map((c) => (c.id === id ? updated : c)));
    }
    setCollModal(null);
  }

  async function saveProject(name: string, color: string) {
    const editingProject = projectModal === 'new' ? null : projectModal;
    const res = await fetch(editingProject ? `/api/projects/${editingProject.id}` : '/api/projects', {
      method: editingProject ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, color }),
    });
    if (!res.ok) return say('Не удалось сохранить проект');
    const project: Project = await res.json();
    setProjects((current) => editingProject ? current.map((value) => value.id === project.id ? project : value) : [...current, project]);
    if (!editingProject) setActiveProject(project.id);
    setProjectModal(null);
  }

  async function deleteProject(project: Project) {
    if (!confirm(`Удалить проект «${project.name}»? Борды останутся без проекта.`)) return;
    setProjects((current) => current.filter((value) => value.id !== project.id));
    setCollections((current) => current.map((value) => value.project_id === project.id ? { ...value, project_id: null } : value));
    if (activeProject === project.id) setActiveProject('all');
    setProjectModal(null);
    await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
  }

  async function moveBoardToProject(boardId: string, projectId: string | null) {
    const board = collections.find((value) => value.id === boardId);
    if (!board || board.project_id === projectId) return;
    setCollections((current) => current.map((value) => value.id === boardId ? { ...value, project_id: projectId } : value));
    const response = await fetch(`/api/collections/${boardId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId }) });
    if (!response.ok) {
      setCollections((current) => current.map((value) => value.id === boardId ? board : value));
      say('Не удалось переместить борд');
    } else say(projectId ? 'Борд перемещён в проект' : 'Борд вынесен из проекта');
  }

  async function saveAccount(data: Partial<Record<string, unknown>>) {
    const response = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
    if (!response.ok) return say('Не удалось сохранить аккаунт');
    setAccount(await response.json());
    say('Настройки сохранены');
  }

  async function uploadAvatar(file?: File) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const resized = await shrink(file, 512, .86);
      const signedResponse = await fetch('/api/upload-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ext: 'webp', contentType: 'image/webp', withThumb: false }) });
      const signed = await signedResponse.json();
      const uploadResponse = await fetch(signed.putUrl, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: resized.blob });
      if (!uploadResponse.ok) throw new Error();
      await saveAccount({ avatarUrl: signed.src });
    } catch { say('Не удалось загрузить аватар'); }
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
      if (e.key === 'Escape') { setEditing(null); setCollModal(null); setProjectModal(null); setLightbox(null); setNewElement(null); setElementMenu(false); }
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('paste', onPaste); document.removeEventListener('keydown', onKey); };
  });

  useEffect(() => {
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.items || [])].some((item) => item.kind === 'file');
    const reset = () => {
      if (dragResetTimer.current) window.clearTimeout(dragResetTimer.current);
      dragResetTimer.current = null;
      setDropping(false);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return reset();
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      setDropping(true);
      if (dragResetTimer.current) window.clearTimeout(dragResetTimer.current);
      dragResetTimer.current = window.setTimeout(reset, 180);
    };
    const drop = (e: DragEvent) => {
      const files = [...(e.dataTransfer?.files || [])];
      reset();
      if (!files.length) return;
      e.preventDefault();
      return addFiles(files);
    };
    const preventNativeImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) e.preventDefault();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('dragend', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('dragstart', preventNativeImageDrag, true);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('dragend', reset);
      window.removeEventListener('blur', reset);
      document.removeEventListener('dragstart', preventNativeImageDrag, true);
      reset();
    };
  }, []);

  /* ---------------- разметка ---------------- */

  const title = active === 'all' ? (activeProject === 'all' ? 'Всё' : projects.find((project) => project.id === activeProject)?.name || 'Всё') : active === 'fav' ? 'Избранное' : collections.find((c) => c.id === active)?.name ?? 'Всё';

  return (
    <div className={'app' + (moveMode ? ' move-mode' : '')}>
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <button className="brand brand-home" aria-label="На главную" onClick={() => { setActiveProject('all'); setActive('all'); setSelectedTag(null); setSearch(''); setMenuOpen(false); router.push('/'); }}><img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b></button>
        <div className="nav">
          {activeProject !== 'all' ? <>
            <div className="project-workspace">
              <button aria-label="Все проекты" onClick={() => { setActiveProject('all'); setActive('all'); router.push('/'); }}><Icon name="back" /></button>
              <div><b>{projects.find((project) => project.id === activeProject)?.name}</b><small>{projectCollections.length} {plural(projectCollections.length, 'борд', 'борда', 'бордов')}</small></div>
              <button aria-label="Настройки проекта" onClick={() => { const project = projects.find((value) => value.id === activeProject); if (project) setProjectModal(project); }}><Icon name="settings" /></button>
            </div>
            <div className="nav-label figma-pages"><span>Борды</span><button aria-label="Новый борд" onClick={() => setCollModal('new')}><Icon name="plus" /></button></div>
            {projectCollections.map((c) => <NavRow key={c.id} id={c.id} name={c.name} color={c.color} count={countOf(c.id)} coll={c} />)}
            <button className="add-coll" onClick={() => setCollModal('new')}><span>＋</span> Новый борд</button>
          </> : <>
            <NavRow id="all" name="Всё" count={countOf('all')} />
            <NavRow id="fav" name="Избранное" count={countOf('fav')} />
            <NavRow id="archive" name="Архив" count={countOf('archive')} />
            {projects.map((project) => <div key={project.id} className={'project-tree' + (projectDrop === project.id ? ' drop' : '')}
              onDragEnter={(event) => { if (!event.dataTransfer.types.includes('application/x-embeddd-board')) return; event.preventDefault(); setProjectDrop(project.id); }}
              onDragOver={(event) => { if (!event.dataTransfer.types.includes('application/x-embeddd-board')) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setProjectDrop(project.id); }}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setProjectDrop(null); }}
              onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const boardId = event.dataTransfer.getData('application/x-embeddd-board') || event.dataTransfer.getData('text/plain') || draggingBoard; if (boardId) void moveBoardToProject(boardId, project.id); setDraggingBoard(null); setProjectDrop(null); }}>
              <button className="project-row project-heading" onClick={() => { setActiveProject(project.id); setActive('all'); router.push(`/projects/${project.slug}`); }}>
                <b>{project.name}</b><i onClick={(event) => { event.stopPropagation(); setProjectModal(project); }}>•••</i>
              </button>
              <div className="project-tree-boards">{collections.filter((board) => board.project_id === project.id).map((board) => <NavRow key={board.id} id={board.id} name={board.name} color={board.color} count={countOf(board.id)} coll={board} compact />)}</div>
            </div>)}
            <button className="add-coll" onClick={() => setProjectModal('new')}><span>＋</span> Новый проект</button>
            <div className="nav-label">Борды без проекта</div>
            {collections.filter((c) => !c.project_id).map((c) => <NavRow key={c.id} id={c.id} name={c.name} color={c.color} count={countOf(c.id)} coll={c} />)}
            <button className="add-coll" onClick={() => setCollModal('new')}><span>＋</span> Новый борд</button>
          </>}
        </div>
        <div className="side-foot"><button className="account-entry" onClick={() => setAccountOpen(true)}>{account?.avatar_url ? <img src={account.avatar_url} alt="" /> : <span>{(account?.nickname || 'E').slice(0, 1).toUpperCase()}</span>}<div><b>{account?.nickname || 'Аккаунт'}</b><small>{account?.email || 'Настройки профиля'}</small></div><Icon name="settings" /></button></div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" aria-label="Открыть коллекции" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div className="title-wrap">
            <h1>{title}</h1>
            <p>{selectedTag ? `#${selectedTag} · ` : ''}{visible.length} {plural(visible.length, 'карточка', 'карточки', 'карточек')}</p>
          </div>
          {selectedTag && <button className="tag-filter" onClick={() => setSelectedTag(null)}>#{selectedTag} ×</button>}
          <div ref={topSearchRef} className={'top-search' + (searchOpen ? ' open' : '')}>{searchOpen && <input autoFocus value={search} placeholder="Поиск" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearch(''); setSearchOpen(false); } }} />}<button className="icon-control" aria-label="Поиск" title="Поиск" onClick={() => { if (searchOpen && search) setSearch(''); else setSearchOpen((value) => !value); }}><Icon name={searchOpen && search ? 'close' : 'search'} /></button></div>
          {active === 'all' && <button className="icon-control" aria-label="Изменить порядок ленты" title={feedOrder === 'newest' ? 'Сначала новые' : 'Сначала старые'} onClick={() => setFeedOrder((value) => value === 'newest' ? 'oldest' : 'newest')}><Icon name="sort" /></button>}
          <div className="reward-control">
            <button className="reward-button icon-control" title={`${progress?.xp || 0} XP`} aria-label="Награды" aria-expanded={rewardsOpen} onClick={() => setRewardsOpen((value) => !value)}><Icon name="award" /></button>
            {rewardsOpen && <>
              <button className="menu-shield" aria-label="Закрыть награды" onClick={() => setRewardsOpen(false)} />
              <div className="rewards-menu">
                <div className="rewards-head"><div><small>Уровень {progress?.level || 1}</small><b>{progress?.xp || 0} XP</b></div><span>🏆</span></div>
                <div className="xp-track"><i style={{ width: `${Math.min(100, ((progress?.xp || 0) / (progress?.nextLevelXp || 100)) * 100)}%` }} /></div>
                <div className="achievement-list">{progress?.achievements.map((achievement) => <div key={achievement.key} className={'achievement' + (achievement.unlocked ? ' unlocked' : '')}>
                  <span>{achievement.icon}</span><div><b>{achievement.title}</b><small>{achievement.description}</small><em>{achievement.unlocked ? `Получено · +${achievement.xp} XP` : `${achievement.progress}/${achievement.target}`}</em></div>
                </div>)}</div>
              </div>
            </>}
          </div>
          <button className={'icon-control move-toggle' + (moveMode ? ' on' : '')} title={moveMode ? 'Завершить перемещение' : 'Переместить'} aria-label={moveMode ? 'Завершить перемещение' : 'Переместить'} aria-pressed={moveMode}
            onClick={() => setMoveMode((value) => !value)}><Icon name={moveMode ? 'check' : 'move'} /></button>
          <button className={'ai-mode-button mode-' + aiMode} aria-pressed={aiMode === 'auto'}
            aria-label={aiMode === 'auto' ? 'Выключить ИИ' : 'Включить ИИ'} onClick={() => chooseAiMode(aiMode === 'auto' ? 'off' : 'auto')}><span>AI</span><small className="ai-credit-tooltip">Осталось {progress?.aiCredits ?? '…'} кредитов</small></button>
          <div className="add-element">
            {!!aiRunning.length && <span className="ai-status" aria-label="ИИ анализирует" title="ИИ анализирует"><i /></span>}
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
            {feedEntries.map((entry) => {
              if (entry.type === 'collection') {
                const collection = entry.value;
              const covers = items.filter((item) => item.collection_id === collection.id && (item.thumb || item.src)).slice(0, 3);
              const itemWidth = gridMetrics.width ? gridMetrics.width / gridMetrics.columns : 0;
              return <div key={`board-${collection.id}`} className="grid-item collection-board-item" style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className="grid-item-content collection-board">
                  <button className="board-open" onClick={() => { setActive(collection.id); router.push(`/boards/${collection.slug}`); }} aria-label={`Открыть ${collection.name}`} />
                  <span className="board-covers">
                    {covers.map((cover, index) => <img key={cover.id} className={`board-cover cover-${index + 1}`} src={cover.thumb || cover.src || ''} alt="" loading="lazy" />)}
                    {!covers.length && <span className="board-empty" style={{ background: collection.color }} />}
                    {collection.access_mode !== 'link' && <span className="board-lock" aria-label="Закрытая коллекция">🔒</span>}
                  </span>
                  <strong>{collection.name}</strong>
                  <small>{countOf(collection.id)} {plural(countOf(collection.id), 'элемент', 'элемента', 'элементов')}</small>
                  <button className="board-menu" aria-label="Редактировать коллекцию" onClick={() => setCollModal(collection)}>•••</button>
                </div>
              </div>;
              }
              const it = entry.value;
              const blockSpan = isBlock(it) ? elementSize(it.display_size) === 'L' ? 3 : elementSize(it.display_size) === 'M' ? 2 : 1 : 1;
              const span = Math.min(blockSpan, gridMetrics.columns);
              const itemWidth = gridMetrics.width ? gridMetrics.width * span / gridMetrics.columns : 0;
              return <div key={it.id} className={`grid-item ${isBlock(it) ? `element-item element-size-${elementSize(it.display_size).toLowerCase()}` : 'pin-item'}`} data-card-id={it.id} style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className="grid-item-content"><Card item={it} /></div>
              </div>
            })}
          </div>
          {!visible.length && !(active === 'all' && collections.length) && (
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
      {disposing && <div className="overlay on" onClick={(event) => { if (event.target === event.currentTarget) setDisposing(null); }}><div className="modal dispose-modal"><h3>Что сделать с карточкой?</h3><p>В архиве она будет храниться 30 дней, затем удалится окончательно.</p><div className="dispose-actions"><button onClick={() => archiveItem(disposing)}><Icon name="archive" /><span><b>Архивировать</b><small>Можно восстановить в течение 30 дней</small></span></button><button className="danger" onClick={() => { const item = disposing; setDisposing(null); void remove(item); }}><Icon name="trash" /><span><b>Удалить навсегда</b><small>Файл сразу удалится из хранилища</small></span></button></div><div className="modal-foot"><button className="btn ghost" onClick={() => setDisposing(null)}>Отмена</button></div></div></div>}
      {collModal && <CollModal />}
      {projectModal && <ProjectModal />}
      {accountOpen && <AccountModal />}
      {newElement && <NewElementModal kind={newElement} />}
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

  function NavRow({ id, name, color, count, coll, compact = false }: { id: Active; name: string; color?: string; count: number; coll?: Collection; compact?: boolean }) {
    return (
      <div
        draggable={!!coll}
        onDragStart={(event) => { if (!coll) return; setDraggingBoard(coll.id); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-embeddd-board', coll.id); event.dataTransfer.setData('text/plain', coll.id); }}
        onDragEnd={() => { setDraggingBoard(null); setProjectDrop(null); }}
        data-collection-drop={id}
        className={'coll' + (active === id ? ' active' : '') + (compact ? ' compact' : '') + (draggingBoard === coll?.id ? ' board-dragging' : '')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.coll-edit')) return;
          setActive(id); setMenuOpen(false);
          if (coll) router.push(`/boards/${coll.slug}`); else router.push('/');
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
          if ((e.target as HTMLElement).closest('button, iframe, .resize')) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || selected.size) {
            e.stopPropagation();
            setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; });
            return;
          }
          if (isMedia) { setLightbox(item.id); window.history.pushState({ embedddPost: item.id }, '', `/posts/${item.slug}`); }
          else if (item.url) window.open(item.url, '_blank', 'noopener');
        }}
      >
        {item.kind === 'image' && (
          <img className={`media crop-${crop}`} draggable={false} loading="lazy" decoding="async" src={item.thumb || item.src || ''} alt=""
            style={item.width && item.height ? { aspectRatio: `${item.width}/${item.height}` } : undefined} />
        )}

        {item.kind === 'video' && <AutoVideo className={`media crop-${crop}`} src={item.src || ''} poster={item.thumb && item.thumb !== item.src ? item.thumb : undefined} />}

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
          {item.archived_at ? <button aria-label="Восстановить карточку" title="Восстановить" onClick={(e) => { e.stopPropagation(); void restoreItem(item); }}><Icon name="restore" /></button> : <button className="del" aria-label="Удалить или архивировать карточку" onClick={(e) => { e.stopPropagation(); setDisposing(item); }}><Icon name="trash" /></button>}
        </div>

        {moveMode && <div className="grip" title="Переместить"><span>⠿</span> Переместить</div>}

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

  function EditModal({ item }: { item: Item }) {
    const [t, setT] = useState(item.title || '');
    const [n, setN] = useState(item.note || '');
    const [c, setC] = useState(item.collection_id || '');
    const [size, setSize] = useState<ElementSize>(elementSize(item.display_size));
    const [textStyle, setTextStyle] = useState<TextStyle>(item.text_style || 'p');
    const [tags, setTags] = useState((item.tags || []).join(', '));

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
          <div className="field"><label>Теги</label><input value={tags} placeholder="дизайн, одежда, минимализм" onChange={(event) => setTags(event.target.value)} /></div>
          {isBlock(item) && <div className="field"><label>Размер элемента</label><select value={size} onChange={(e) => setSize(e.target.value as ElementSize)}>
            <option value="S">S — одна колонка</option><option value="M">M — две колонки</option><option value="L">L — три колонки</option>
          </select></div>}
          {item.kind === 'text' && <div className="field"><label>Стиль текста</label><div className="text-style-picker">
            {(['p', 'h1', 'h2', 'h3', 'h4', 'h5'] as TextStyle[]).map((value) => <button key={value} className={textStyle === value ? 'on' : ''} onClick={() => setTextStyle(value)}>{value === 'p' ? 'Текст' : value.toUpperCase()}</button>)}
          </div></div>}
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn" onClick={() => { patch(item.id, { title: t, note: n, tags: tags.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean), collectionId: c || null, ...(isBlock(item) ? { displaySize: size } : {}), textStyle }); setEditing(null); }}>Сохранить</button>
          </div>
        </div>
      </div>
    );
  }

  function CollModal() {
    const c = collModal === 'new' ? null : (collModal as Collection);
    const [name, setName] = useState(c?.name || '');
    const [color, setColor] = useState(c?.color || '#C6F04A');
    const [access, setAccess] = useState<Collection['access_mode']>(c?.access_mode || 'private');
    const [projectId, setProjectId] = useState(c?.project_id || (activeProject === 'all' ? '' : activeProject));

    return (
      <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setCollModal(null); }}>
        <div className="modal">
          <h3>{c ? 'Борд' : 'Новый борд'}</h3>
          <div className="field"><label>Название</label>
            <input value={name} autoFocus placeholder="Упаковка / Лендинги / Съёмки"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && saveCollection(name.trim(), color, access, projectId || null)} /></div>
          <div className="field"><label>{c ? 'Переместить в проект' : 'Проект'}</label><select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Без проекта</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select></div>
          <div className="field"><label>Цвет метки</label>
            <input type="color" value={color} style={{ height: 38, padding: 3 }} onChange={(e) => setColor(e.target.value)} /></div>
          <div className="field"><label>Доступ</label><select value={access} onChange={(e) => setAccess(e.target.value as Collection['access_mode'])}>
            <option value="private">Только я</option><option value="link">По ссылке</option>
          </select></div>
          {c?.share_token && access === 'link' && <button className="share-link" onClick={() => { navigator.clipboard.writeText(`${location.origin}/c/${c.share_token}`); say('Ссылка скопирована'); }}>Скопировать публичную ссылку</button>}
          <div className="modal-foot">
            {c && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => deleteCollection(c)}>Удалить</button>}
            <button className="btn ghost" onClick={() => setCollModal(null)}>Отмена</button>
            <button className="btn" onClick={() => name.trim() && saveCollection(name.trim(), color, access, projectId || null)}>{c ? 'Сохранить' : 'Создать'}</button>
          </div>
        </div>
      </div>
    );
  }

  function ProjectModal() {
    const project = projectModal === 'new' ? null : projectModal;
    const [name, setName] = useState(project?.name || '');
    const [color, setColor] = useState(project?.color || '#C6F04A');
    return <div className="overlay on" onClick={(event) => { if (event.target === event.currentTarget) setProjectModal(null); }}><div className="modal">
      <h3>{project ? 'Проект' : 'Новый проект'}</h3>
      <div className="field"><label>Название</label><input autoFocus value={name} placeholder="Клиент / Бренд / Личное" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && saveProject(name.trim(), color)} /></div>
      <div className="field"><label>Цвет</label><input type="color" value={color} style={{ height: 38, padding: 3 }} onChange={(event) => setColor(event.target.value)} /></div>
      <div className="modal-foot">{project && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => deleteProject(project)}>Удалить</button>}<button className="btn ghost" onClick={() => setProjectModal(null)}>Отмена</button><button className="btn" onClick={() => name.trim() && saveProject(name.trim(), color)}>{project ? 'Сохранить' : 'Создать'}</button></div>
    </div></div>;
  }

  function AccountModal() {
    const [nickname, setNickname] = useState(account?.nickname || '');
    const [email, setEmail] = useState(account?.email || '');
    const [role, setRole] = useState<Account['role']>(account?.role || 'owner');
    const [permissions, setPermissions] = useState<string[]>(account?.permissions || []);
    const permissionOptions = [
      ['manage_content', 'Контент', 'Добавлять, изменять и удалять карточки'], ['manage_projects', 'Проекты и борды', 'Создавать и переносить борды'],
      ['manage_ai', 'AI-инструменты', 'Анализировать изображения и тратить кредиты'], ['manage_account', 'Аккаунт', 'Менять профиль и права'],
    ];
    return <div className="overlay on" onClick={(event) => { if (event.target === event.currentTarget) setAccountOpen(false); }}><div className="modal account-modal">
      <div className="account-head"><div className="account-avatar">{account?.avatar_url ? <img src={account.avatar_url} alt="" /> : <span>{(nickname || 'E').slice(0, 1).toUpperCase()}</span>}<button onClick={() => avatarRef.current?.click()}>Изменить</button></div><div><h3>Настройки аккаунта</h3><p>Профиль и права доступа</p></div></div>
      <input ref={avatarRef} hidden type="file" accept="image/*" onChange={(event) => { void uploadAvatar(event.target.files?.[0]); event.target.value = ''; }} />
      <div className="account-grid"><div className="field"><label>Никнейм</label><input value={nickname} onChange={(event) => setNickname(event.target.value)} /></div><div className="field"><label>Email</label><input type="email" value={email} placeholder="name@example.com" onChange={(event) => setEmail(event.target.value)} /></div></div>
      <div className="field"><label>Роль</label><select value={role} onChange={(event) => setRole(event.target.value as Account['role'])}><option value="owner">Владелец</option><option value="editor">Редактор</option><option value="viewer">Наблюдатель</option></select></div>
      <div className="permissions"><label>Права</label>{permissionOptions.map(([value, title, note]) => <button key={value} className={permissions.includes(value) ? 'on' : ''} onClick={() => setPermissions((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}><i>{permissions.includes(value) ? '✓' : ''}</i><span><b>{title}</b><small>{note}</small></span></button>)}</div>
      <div className="account-meta"><span>AI-кредиты</span><b>{progress?.aiCredits ?? '—'}</b></div>
      <div className="modal-foot"><button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={async () => { await fetch('/api/auth', { method: 'DELETE' }); location.href = '/login'; }}>Выйти</button><button className="btn ghost" onClick={() => setAccountOpen(false)}>Отмена</button><button className="btn" onClick={async () => { await saveAccount({ nickname, email, role, permissions }); setAccountOpen(false); }}>Сохранить</button></div>
    </div></div>;
  }

  function Lightbox() {
    const list = visible.filter((i) => i.kind === 'image' || i.kind === 'video');
    const it = list.find((i) => i.id === lightbox);
    if (!it) return null;
    const [description, setDescription] = useState(it.note || '');
    const [editingDescription, setEditingDescription] = useState(false);
    const board = collections.find((value) => value.id === it.collection_id);
    const project = projects.find((value) => value.id === board?.project_id);
    const recommendations = items.filter((value) => value.id !== it.id && !value.archived_at && (value.kind === 'image' || value.kind === 'video') && (value.collection_id === it.collection_id || value.tags?.some((tag) => it.tags?.includes(tag)))).slice(0, 6);

    return (
      <div className="lb on" onClick={(event) => { if (event.target === event.currentTarget) { setLightbox(null); router.back(); } }}>
        <button className="lb-back" aria-label="Назад" onClick={() => { setLightbox(null); router.back(); }}><Icon name="back" /></button>
        <div className="pin-detail">
          <div className="pin-detail-media">{it.kind === 'video' ? <video src={it.src || ''} poster={it.thumb && it.thumb !== it.src ? it.thumb : undefined} controls autoPlay playsInline preload="metadata" /> : <img src={it.src || it.thumb || ''} alt={it.title || ''} />}</div>
          <div className="pin-detail-info">
            <h2>{it.title || 'Без названия'}</h2>
            <div className="description-field"><label>Описание</label>{editingDescription ? <textarea autoFocus value={description} placeholder="Добавить описание…" onChange={(event) => setDescription(event.target.value)} onBlur={() => { void patch(it.id, { note: description }); setEditingDescription(false); }} /> : <button className={'description-read' + (!description ? ' empty' : '')} onClick={() => setEditingDescription(true)}>{description || 'Добавить описание'}</button>}</div>
            {!!it.tags?.length && <div className="lb-tags">{it.tags.map((tag) => <button key={tag} onClick={(event) => {
            event.stopPropagation(); setSelectedTag(tag); setActive('all'); setLightbox(null);
          }}>#{tag}</button>)}</div>}
            {(project || board) && <div className="detail-location">{project && <button onClick={() => { setLightbox(null); router.push(`/projects/${project.slug}`); }}><small>Проект</small><b>{project.name}</b></button>}{board && <button onClick={() => { setLightbox(null); router.push(`/boards/${board.slug}`); }}><small>Борд</small><b>{board.name}</b></button>}</div>}
            {!!recommendations.length && <div className="detail-recommendations"><label>Похожие</label><div>{recommendations.map((item) => <button key={item.id} onClick={() => { setLightbox(item.id); window.history.replaceState({ embedddPost: item.id }, '', `/posts/${item.slug}`); }}>{item.kind === 'video' ? <video muted playsInline preload="metadata" src={item.src || ''} /> : <img src={item.thumb || item.src || ''} alt="" />}</button>)}</div></div>}
            <button className="detail-edit" onClick={() => { setEditing(it); setLightbox(null); }}>Редактировать карточку</button>
          </div>
        </div>
      </div>
    );
  }

}

/* ---------------- мелочи ---------------- */

function AutoVideo({ src, className, poster }: { src: string; className: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setNear(true);
      if (!entry.isIntersecting) video.pause();
    }, { rootMargin: '280px 0px', threshold: [0, .55] });
    observer.observe(video);
    return () => { observer.disconnect(); video.pause(); };
  }, []);
  return <video ref={ref} className={className} draggable={false} muted loop playsInline poster={poster} preload={near ? 'metadata' : 'none'} src={near ? src : undefined}
    onLoadedMetadata={(event) => { if (!poster && event.currentTarget.duration > .05) event.currentTarget.currentTime = .05; }}
    onMouseEnter={(event) => { void event.currentTarget.play().catch(() => {}); }} onMouseLeave={(event) => event.currentTarget.pause()} />;
}

function Icon({ name }: { name: 'search' | 'close' | 'award' | 'sort' | 'move' | 'check' | 'back' | 'settings' | 'plus' | 'archive' | 'trash' | 'restore' }) {
  const paths: Record<typeof name, React.ReactNode> = {
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    close: <><path d="M6 6l12 12M18 6 6 18"/></>,
    award: <><circle cx="12" cy="9" r="5"/><path d="m8.5 13-1 8 4.5-2.5L16.5 21l-1-8"/><path d="m10 9 1.3 1.3L14 7.7"/></>,
    sort: <><path d="M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3"/></>,
    move: <><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    back: <><path d="m15 18-6-6 6-6"/><path d="M9 12h11"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    archive: <><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></>,
    restore: <><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8"/><path d="M4 3v5h5"/></>,
  };
  return <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

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
