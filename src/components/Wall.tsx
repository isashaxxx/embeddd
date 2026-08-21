'use client';

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type Muuri from 'muuri';
import type { Account, Collection, Item, Progress, Project } from '@/lib/types';
import { shrink, videoPreview, videoSize } from '@/lib/resize';
import CalendarWidget from './widgets/CalendarWidget';
import WeatherWidget from './widgets/WeatherWidget';
import type { WidgetSettings } from './widgets/CalendarWidget';

type Props = { initialProjects: Project[]; initialCollections: Collection[]; initialItems: Item[]; initialActive?: string; initialProject?: string; initialPost?: string };
type Active = 'all' | 'fav' | string;
type NewElement = 'link' | 'text' | 'callout' | 'html' | 'widget_calendar' | 'widget_weather';
type WidgetKind = 'widget_calendar' | 'widget_weather';
type ElementSize = 'S' | 'M' | 'L' | 'XL';
type TextStyle = Item['text_style'];
type AiSuggestion = { title: string; description: string; collections: string[]; tags: string[] };
type AiMode = 'auto' | 'off';

const BLOCK_KINDS = new Set(['text', 'heading', 'callout', 'html', 'divider', 'widget_calendar', 'widget_weather']);
const isBlock = (item: Item) => BLOCK_KINDS.has(item.kind);
const isWidgetKind = (kind: string): kind is WidgetKind => kind === 'widget_calendar' || kind === 'widget_weather';
const WIDGET_ACCENTS = ['#5B7CFA', '#F5A623', '#34C759', '#A78BFA', '#FF6B81'];
function parseWidgetSettings(note: string | null | undefined): WidgetSettings {
  try {
    const parsed = JSON.parse(note || '');
    return { theme: parsed.theme === 'light' ? 'light' : 'dark', accent: typeof parsed.accent === 'string' ? parsed.accent : WIDGET_ACCENTS[0] };
  } catch {
    return { theme: 'dark', accent: WIDGET_ACCENTS[0] };
  }
}
const elementSize = (size: Item['display_size']): ElementSize => size === 'M' ? 'M' : size === 'L' ? 'L' : size === 'XL' ? 'XL' : 'S';
const SIZE_PRESETS: { value: ElementSize; label: string; subtitle: string; cols: number }[] = [
  { value: 'S', label: 'Компактный', subtitle: '1 колонка · плотная лента', cols: 1 },
  { value: 'M', label: 'Средний', subtitle: '2 колонки · базовая раскладка', cols: 2 },
  { value: 'L', label: 'Широкий', subtitle: '3 колонки · развёрнутый вид', cols: 3 },
  { value: 'XL', label: 'Во всю ширину', subtitle: 'Растягивается на всю ленту', cols: 4 },
];

function SizePickerModal({ value, onChange, onConfirm, onClose }: { value: ElementSize; onChange: (size: ElementSize) => void; onConfirm: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<'components' | 'ai'>('components');
  return (
    <div className="overlay on size-picker-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="size-picker-modal">
        <div className="size-picker-tabs">
          <button className={tab === 'components' ? 'on' : ''} onClick={() => setTab('components')}>Компоненты</button>
          <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>AI Промт <i>PRO</i></button>
        </div>
        {tab === 'components' ? (
          <div className="size-picker-grid">
            {SIZE_PRESETS.map((preset) => (
              <button key={preset.value} className={'size-preset' + (value === preset.value ? ' on' : '')} onClick={() => onChange(preset.value)}>
                <span className="size-preset-preview">{Array.from({ length: preset.cols }).map((_, i) => <b key={i} />)}</span>
                <strong>{preset.label}</strong>
                <small>{preset.subtitle}</small>
              </button>
            ))}
          </div>
        ) : (
          <div className="size-picker-pro">AI-раскладка по промпту — скоро.</div>
        )}
        <button className="size-picker-confirm" onClick={onConfirm}>Готово</button>
      </div>
    </div>
  );
}
const pinCrop = (item: Item) => {
  const numericPosition = Number(item.position);
  const fallback = [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const seed = Number.isFinite(numericPosition) ? Math.round(numericPosition) : fallback;
  return (['compact', 'portrait', 'tall'] as const)[Math.abs(seed) % 3];
};

export default function Wall({ initialProjects, initialCollections, initialItems, initialActive = 'all', initialProject = 'all', initialPost }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [collections, setCollections] = useState(initialCollections);
  const [items, setItems] = useState(initialItems);
  const [active, setActive] = useState<Active>(initialActive);
  const [locationReady, setLocationReady] = useState(initialActive !== 'all' || initialProject !== 'all' || !!initialPost);
  const [editing, setEditing] = useState<Item | null>(null);
  const [disposing, setDisposing] = useState<Item | null>(null);
  const [sizePicker, setSizePicker] = useState<Item | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  function toggleProjectExpanded(id: string) {
    setCollapsedProjects((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  const [bulkSizeOpen, setBulkSizeOpen] = useState(false);
  const [bulkSize, setBulkSize] = useState<ElementSize>('S');
  const [collModal, setCollModal] = useState<Collection | 'new' | null>(null);
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null);
  const [activeProject, setActiveProject] = useState<string>(initialProject);
  const [lightbox, setLightbox] = useState<string | null>(() => initialPost ? initialItems.find((item) => item.slug === initialPost || item.id === initialPost)?.id || null : null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [draggingBoard, setDraggingBoard] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ done: number; total: number; label: string } | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);
  const [dropping, setDropping] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [feedOrder, setFeedOrder] = useState<'newest' | 'oldest'>('newest');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [elementMenu, setElementMenu] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [newElement, setNewElement] = useState<NewElement | null>(null);
  const [contentTab, setContentTab] = useState<'all' | 'boards' | 'items'>('all');
  const boardSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [aiRunning, setAiRunning] = useState<string[]>([]);
  const [aiMode, setAiMode] = useState<AiMode>('auto');
  const [aiCardPercent, setAiCardPercent] = useState(0);
  const [aiCardShow, setAiCardShow] = useState(false);
  const aiActive = aiRunning.length > 0;
  useEffect(() => {
    if (aiActive) {
      setAiCardShow(true);
      setAiCardPercent((p) => (p > 0 ? p : 8));
      const id = setInterval(() => setAiCardPercent((p) => (p < 90 ? Math.min(90, p + (90 - p) * 0.15 + 1) : p)), 260);
      return () => clearInterval(id);
    }
    setAiCardPercent((p) => (p > 0 ? 100 : 0));
    const hide = setTimeout(() => setAiCardShow(false), 900);
    return () => clearTimeout(hide);
  }, [aiActive]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gridMetrics, setGridMetrics] = useState({ width: 0, columns: 2 });
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const topSearchRef = useRef<HTMLDivElement>(null);
  const dragResetTimer = useRef<number | null>(null);
  // The window "drop" listener is registered once (see the mount-only
  // effect below) so it doesn't thrash on every render — but that means
  // its closure would otherwise forever call the addFiles from the FIRST
  // render, frozen with whichever project was active on page load. A ref
  // synced every render lets it always reach the current addFiles instead.
  const addFilesRef = useRef<(files: File[]) => void>(() => {});
  const selectionBoxRef = useRef<HTMLDivElement>(null);
  const selectionIdsRef = useRef<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const muuriRef = useRef<Muuri | null>(null);
  const muuriCtorRef = useRef<typeof import('muuri').default | null>(null);
  // Concurrent AI placements for a batch upload all resolve around the same
  // time; without this, each independently sees no matching board yet and
  // creates its own, so a 15-photo upload ends up with 15 identical boards.
  const collectionCreationRef = useRef<Map<string, Promise<Collection>>>(new Map());

  useEffect(() => {
    if (locationReady) return;
    try {
      const saved = JSON.parse(localStorage.getItem('embeddd:last-location') || '{}') as { active?: string; project?: string };
      const savedBoard = saved.active && !['all', 'fav', 'archive'].includes(saved.active)
        ? initialCollections.find((board) => board.id === saved.active)
        : null;
      if (savedBoard) {
        setActive(savedBoard.id);
        setActiveProject(savedBoard.project_id || 'all');
      } else {
        const savedProject = initialProjects.some((project) => project.id === saved.project) ? saved.project! : 'all';
        setActiveProject(savedProject);
        setActive(saved.active === 'fav' || saved.active === 'archive' ? saved.active : 'all');
      }
    } catch {
      localStorage.removeItem('embeddd:last-location');
    }
    setLocationReady(true);
  }, [initialCollections, initialProjects, locationReady]);

  useEffect(() => {
    if (!locationReady || initialPost) return;
    localStorage.setItem('embeddd:last-location', JSON.stringify({ active, project: activeProject }));
  }, [active, activeProject, initialPost, locationReady]);

  useEffect(() => { setContentTab('all'); }, [activeProject]);

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

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem('embeddd:sidebar-collapsed') === '1');
  }, []);

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((value) => {
      localStorage.setItem('embeddd:sidebar-collapsed', value ? '0' : '1');
      return !value;
    });
  }

  function chooseAiMode(mode: AiMode) {
    setAiMode(mode);
    localStorage.setItem('embeddd:ai-mode', mode);
    say(mode === 'auto' ? 'ИИ включён — всё сделает сам' : 'ИИ выключен');
  }

  // ai_credits — фиксированный запас (100 при первом запуске), который
  // только тратится и никогда не пополняется сам. Когда он кончается,
  // выключаем автоматический ИИ, а не оставляем его биться в закрытую дверь.
  useEffect(() => {
    if (progress && progress.aiCredits <= 0 && aiMode === 'auto') {
      setAiMode('off');
      localStorage.setItem('embeddd:ai-mode', 'off');
      say('ИИ выключен — закончились кредиты');
    }
  }, [progress, aiMode, say]);

  async function topUpCredits() {
    const response = await fetch('/api/progress', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ delta: 100 }) });
    if (!response.ok) return say('Не удалось начислить кредиты');
    const data = await response.json();
    setProgress((current) => current ? { ...current, aiCredits: data.aiCredits } : current);
    say('Начислено 100 AI-кредитов');
  }

  /* ---------------- данные ---------------- */

  const projectCollections = (activeProject === 'all' ? [...collections] : collections.filter((c) => c.project_id === activeProject)).sort((a, b) => Number(a.position) - Number(b.position));
  const boardsForProject = (projectId: string | null) => collections.filter((board) => board.project_id === projectId).sort((a, b) => Number(a.position) - Number(b.position));
  const unassignedBoards = boardsForProject(null);
  const projectCollectionIds = new Set(projectCollections.map((c) => c.id));
  const visible = items.filter((i) => {
    const inSection = active === 'archive' ? !!i.archived_at : active === 'projects' ? false : !i.archived_at && (active === 'all' ? true : active === 'fav' ? i.fav : i.collection_id === active);
    const inProject = activeProject === 'all' || (!!i.collection_id && projectCollectionIds.has(i.collection_id));
    const haystack = `${i.title} ${i.note} ${(i.tags || []).join(' ')}`.toLocaleLowerCase();
    return inSection && inProject && (!selectedTag || i.tags?.includes(selectedTag)) && (!search.trim() || haystack.includes(search.trim().toLocaleLowerCase()));
  });

  const currentProject = activeProject === 'all' ? null : projects.find((project) => project.id === activeProject) || null;
  const projectRootView = activeProject !== 'all' && active === 'all';
  const projectsGalleryView = active === 'projects';
  const projectItemCount = activeProject === 'all' ? 0 : items.filter((item) => !item.archived_at && item.collection_id && projectCollectionIds.has(item.collection_id)).length;
  const projectCoverThumbs = activeProject === 'all' ? [] : items
    .filter((item) => !item.archived_at && item.collection_id && projectCollectionIds.has(item.collection_id) && (item.thumb || item.src))
    .sort((a, b) => (b.created_at ? new Date(b.created_at).getTime() : 0) - (a.created_at ? new Date(a.created_at).getTime() : 0))
    .slice(0, 4);

  const feedEntries: ({ type: 'item'; value: Item } | { type: 'collection'; value: Collection })[] = active === 'all'
    ? [
        ...(!projectRootView || contentTab !== 'boards' ? visible.map((value) => ({ type: 'item' as const, value })) : []),
        ...(!selectedTag && (!projectRootView || contentTab !== 'items') ? projectCollections.map((value) => ({ type: 'collection' as const, value })) : []),
      ].sort((a, b) => {
        const aTime = a.value.created_at ? new Date(a.value.created_at).getTime() : a.value.id.startsWith('temp-') ? Date.now() : 0;
        const bTime = b.value.created_at ? new Date(b.value.created_at).getTime() : b.value.id.startsWith('temp-') ? Date.now() : 0;
        return feedOrder === 'newest' ? bTime - aTime : aTime - bTime;
      })
    : visible.map((value) => ({ type: 'item' as const, value }));

  const countOf = (id: Active) =>
    id === 'all' ? items.filter((i) => !i.archived_at).length : id === 'fav' ? items.filter((i) => i.fav && !i.archived_at).length : id === 'archive' ? items.filter((i) => i.archived_at).length : items.filter((i) => i.collection_id === id && !i.archived_at).length;

  const targetCollection = () => (active === 'all' || active === 'fav' || active === 'projects' ? null : active);

  const gridSignature = projectsGalleryView
    ? projects.map((project) => `project:${project.id}`).join('|')
    : feedEntries.map((entry) => entry.type === 'item'
        ? `${entry.value.id}:${isBlock(entry.value) ? elementSize(entry.value.display_size) : 'pin'}`
        : `board:${entry.value.id}`).join('|');

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

    // Loading the module fresh on every items/moveMode change raced two
    // destroy+rebuild cycles against each other when changes landed close
    // together (e.g. deleting twice in a row) — whichever import() resolved
    // last would silently win, leaving Muuri's layout out of sync with the
    // DOM. Load the constructor once and reuse it synchronously after that.
    const setup = (MuuriGrid: typeof import('muuri').default) => {
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

      // Пересоздание инстанса Muuri (эффект перезапускается при смене
      // gridSignature — например когда карточка при drag-and-drop уходит
      // в другую коллекцию и пропадает из текущей ленты) может произойти,
      // пока Muuri ещё доигрывает анимацию отпускания карточки. Без этой
      // проверки его отложенные колбэки трогают уже уничтоженный инстанс
      // и роняют приложение — поэтому каждый обработчик выходит, если
      // эффект уже был убран (cancelled).
      instance.on('dragStart', (item) => {
        if (cancelled) return;
        const element = item.getElement();
        if (element) {
          element.classList.add('is-grabbed');
        }
        document.body.classList.add('grid-dragging');
      });
      instance.on('dragMove', (_item, event) => {
        if (cancelled) return;
        document.querySelectorAll('.coll.drop').forEach((el) => el.classList.remove('drop'));
        const underPointer = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
        underPointer?.closest<HTMLElement>('[data-collection-drop]')?.classList.add('drop');
      });
      instance.on('dragEnd', (item, event) => {
        if (cancelled) return;
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
        if (cancelled) return;
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
    };

    if (muuriCtorRef.current) {
      setup(muuriCtorRef.current);
    } else {
      void import('muuri').then(({ default: MuuriGrid }) => {
        muuriCtorRef.current = MuuriGrid;
        setup(MuuriGrid);
      });
    }

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
    const ids = [...selected].filter((id) => items.some((item) => item.id === id));
    setItems((p) => p.map((item) => ids.includes(item.id) ? { ...item, collection_id: collectionId || null } : item));
    ids.forEach((id) => fetch(`/api/items/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: collectionId || null }) }));
    setSelected(new Set());
  }

  async function deleteSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    const boardIds = ids.filter((id) => id.startsWith('board:')).map((id) => id.slice(6));
    const itemIds = ids.filter((id) => !id.startsWith('board:'));

    // Удаление борда каскадно сносит и его карточки — убираем их из списка
    // тут же, чтобы не остались висеть до следующего запроса.
    const removed = items.filter((item) => itemIds.includes(item.id));
    setItems((p) => p.filter((item) => !itemIds.includes(item.id) && !(item.collection_id && boardIds.includes(item.collection_id))));
    setCollections((p) => p.filter((c) => !boardIds.includes(c.id)));
    if (boardIds.length) collectionCreationRef.current.clear();
    if (boardIds.includes(active)) setActive('all');
    setSelected(new Set());

    const [itemResults, boardResults] = await Promise.all([
      Promise.all(itemIds.map((id) => fetch(`/api/items/${id}`, { method: 'DELETE' }).then((res) => res.ok).catch(() => false))),
      Promise.all(boardIds.map((id) => fetch(`/api/collections/${id}`, { method: 'DELETE' }).then((res) => res.ok).catch(() => false))),
    ]);
    const failedIds = new Set(itemIds.filter((_, index) => !itemResults[index]));
    if (failedIds.size) setItems((p) => [...removed.filter((item) => failedIds.has(item.id)), ...p]);

    if (failedIds.size || boardResults.some((ok) => !ok)) say('Часть не удалилась — попробуй ещё раз');
    else say('Удалено');
  }

  async function mergeSelectedBoards() {
    const boardIds = [...selected].filter((id) => id.startsWith('board:')).map((id) => id.slice(6));
    if (boardIds.length < 2) return;
    const boards = collections.filter((c) => boardIds.includes(c.id));
    // Оставляем борд с наибольшим количеством карточек — меньше всего
    // переименовывать/переносить руками после объединения.
    const target = boards.reduce((best, b) => (countOf(b.id) > countOf(best.id) ? b : best), boards[0]);
    const sources = boards.filter((b) => b.id !== target.id);
    const sourceIds = sources.map((b) => b.id);
    const affected = items.filter((item) => item.collection_id && sourceIds.includes(item.collection_id));
    setItems((p) => p.map((item) => item.collection_id && sourceIds.includes(item.collection_id) ? { ...item, collection_id: target.id } : item));
    setCollections((p) => p.filter((c) => !sourceIds.includes(c.id)));
    collectionCreationRef.current.clear();
    if (sourceIds.includes(active)) setActive(target.id);
    setSelected(new Set());

    await Promise.all(affected.map((item) => fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: target.id }) })));
    await Promise.all(sourceIds.map((id) => fetch(`/api/collections/${id}`, { method: 'DELETE' })));
    say(`Объединено в «${target.name}»`);
  }

  // Автоматическая склейка похожих бордов: ИИ иногда создаёт по борду на
  // карточку (например, если в кадре есть текст каталога, который каждый
  // раз формулируется чуть иначе и не матчится по точному имени). Здесь
  // группируем борды по пересечению тегов их карточек и по общим словам в
  // названии — это не зависит от точной формулировки, в отличие от ИИ.
  const BOARD_NAME_STOPWORDS = new Set(['новая', 'новый', 'новое', 'каталог', 'коллекция', 'коллекции', 'женской', 'женская', 'мужской', 'мужская', 'одежды', 'одежда', 'лукбук']);
  function boardNameWords(name: string) {
    return name.toLocaleLowerCase().replace(/[«»"'.,:;!?()]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !BOARD_NAME_STOPWORDS.has(w));
  }
  function boardTopTags(boardId: string, n = 3) {
    const freq = new Map<string, number>();
    items.filter((item) => item.collection_id === boardId).forEach((item) => (item.tags || []).forEach((tag) => freq.set(tag, (freq.get(tag) || 0) + 1)));
    return [...freq].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag]) => tag);
  }

  async function autoMergeSimilarBoards() {
    const scope = projectCollections;
    if (scope.length < 2) return say('Недостаточно бордов для объединения');

    const parent = new Map(scope.map((b) => [b.id, b.id]));
    const find = (id: string): string => {
      const p = parent.get(id)!;
      if (p === id) return id;
      const root = find(p);
      parent.set(id, root);
      return root;
    };
    const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    for (let i = 0; i < scope.length; i++) {
      const tagsA = new Set(boardTopTags(scope[i].id));
      const nameA = new Set(boardNameWords(scope[i].name));
      for (let j = i + 1; j < scope.length; j++) {
        const tagsB = new Set(boardTopTags(scope[j].id));
        const nameB = new Set(boardNameWords(scope[j].name));
        const sharedTags = [...tagsA].filter((t) => tagsB.has(t)).length;
        const sharedWords = [...nameA].filter((w) => nameB.has(w)).length;
        const nameOverlap = sharedWords / Math.max(1, Math.min(nameA.size, nameB.size));
        if (sharedTags >= 2 || (sharedTags >= 1 && nameOverlap >= 0.5) || nameOverlap >= 0.7) union(scope[i].id, scope[j].id);
      }
    }

    const clusters = new Map<string, Collection[]>();
    scope.forEach((board) => { const root = find(board.id); clusters.set(root, [...(clusters.get(root) || []), board]); });
    const groups = [...clusters.values()].filter((group) => group.length > 1);
    if (!groups.length) return say('Похожих бордов не найдено');

    let mergedCount = 0;
    for (const group of groups) {
      const target = group.reduce((best, b) => (countOf(b.id) > countOf(best.id) ? b : best), group[0]);
      const sourceIds = group.filter((b) => b.id !== target.id).map((b) => b.id);
      const affected = items.filter((item) => item.collection_id && sourceIds.includes(item.collection_id));
      setItems((p) => p.map((item) => item.collection_id && sourceIds.includes(item.collection_id) ? { ...item, collection_id: target.id } : item));
      setCollections((p) => p.filter((c) => !sourceIds.includes(c.id)));
      if (sourceIds.includes(active)) setActive(target.id);
      await Promise.all(affected.map((item) => fetch(`/api/items/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ collectionId: target.id }) })));
      await Promise.all(sourceIds.map((id) => fetch(`/api/collections/${id}`, { method: 'DELETE' })));
      mergedCount += sourceIds.length;
    }
    collectionCreationRef.current.clear();
    setSelected(new Set());
    say(`Объединено бордов: ${mergedCount}`);
  }

  // Загрузка в проект без выбранного борда обязана сразу дать карточке
  // видимый борд — иначе, пока ИИ (если он вообще включён и у него есть
  // кредиты) не отработает, карточка висит с collection_id = null и не
  // проходит фильтр "принадлежит проекту", то есть невидима. Переиспользуем
  // первый существующий борд проекта, а если бордов вообще нет — заводим
  // дефолтный "Board 1", как в Notion.
  async function resolveDefaultBoard(projectId: string): Promise<Collection> {
    const key = `default:${projectId}`;
    let creation = collectionCreationRef.current.get(key);
    if (!creation) {
      creation = (async () => {
        const existingBoard = collections.find((c) => c.project_id === projectId);
        if (existingBoard) return existingBoard;
        const colors = ['#C6F04A', '#FFB86B', '#87CEEB', '#D6B4FC', '#FF8F8F'];
        const res = await fetch('/api/collections', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Board 1', color: colors[collections.length % colors.length], projectId }),
        });
        if (!res.ok) throw new Error('default board create failed');
        return res.json() as Promise<Collection>;
      })();
      creation.catch(() => { collectionCreationRef.current.delete(key); });
      collectionCreationRef.current.set(key, creation);
    }
    const board = await creation;
    setCollections((p) => p.some((c) => c.id === board.id) ? p : [...p, board]);
    return board;
  }

  async function placeAutomatically(item: Item, result: AiSuggestion, projectIdOverride?: string | null, provisional = false) {
    // A board explicitly chosen by the user always wins over AI auto-placement.
    // AI may enrich the card, but silently moving a freshly uploaded item makes
    // it look as if the upload failed in the currently open board — unless that
    // board was only our own fallback placement (`provisional`), in which case
    // AI is still free to move it into a more fitting board.
    if (item.collection_id && !provisional) {
      await patch(item.id, { title: result.title, note: result.description, tags: result.tags });
      say('ИИ добавил название и теги');
      return;
    }

    // Uploading inside a project must keep the new board inside that project —
    // otherwise the card has no collection_id/project link and silently
    // disappears from the project view, only showing up back in "Всё".
    const projectId = projectIdOverride !== undefined ? projectIdOverride : (activeProject === 'all' ? null : activeProject);
    const scoped = projectId === null ? collections : collections.filter((c) => c.project_id === projectId);
    const existingOption = result.collections.find((name) => scoped.some((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase()));
    const collectionName = existingOption || result.collections[0];
    const nameKey = collectionName.toLocaleLowerCase();
    const key = `${projectId || 'none'}:${nameKey}`;
    let collection = scoped.find((c) => c.name.toLocaleLowerCase() === nameKey);
    if (!collection) {
      // A batch upload fires AI placement for every photo close together, so
      // several calls can land here for the same board name before any of
      // them has finished creating it — share one in-flight request instead
      // of racing duplicates. Crucially, once that request SUCCEEDS we keep
      // it cached here too (not just deleted on settle): `collections` React
      // state only updates on the next render, but items later in the same
      // batch are already-created closures still holding the pre-render
      // snapshot, so without this cache they'd never see the board this ref
      // just created and would each create their own duplicate.
      let creation = collectionCreationRef.current.get(key);
      if (!creation) {
        const colors = ['#C6F04A', '#FFB86B', '#87CEEB', '#D6B4FC', '#FF8F8F'];
        creation = fetch('/api/collections', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: collectionName, color: colors[collections.length % colors.length], projectId }),
        }).then((res) => {
          if (!res.ok) throw new Error('collection create failed');
          return res.json() as Promise<Collection>;
        });
        creation.catch(() => { collectionCreationRef.current.delete(key); });
        collectionCreationRef.current.set(key, creation);
      }
      try {
        collection = await creation;
        setCollections((p) => p.some((c) => c.id === collection!.id) ? p : [...p, collection!]);
      } catch {
        collection = undefined;
      }
    }
    // If AI couldn't resolve a board for a provisional item, leave it in its
    // fallback board rather than nulling it out — a card should never end up
    // less visible after AI runs than it was before.
    const finalCollectionId = collection?.id ?? (provisional ? item.collection_id : null);
    await patch(item.id, { title: result.title, note: result.description, tags: result.tags, collectionId: finalCollectionId });
    say(collection ? `ИИ разместил в «${collection.name}»` : 'ИИ назвал карточку');
  }

  async function analyzeImage(item: Item, manual = false, projectIdOverride?: string | null, provisional = false) {
    if (aiMode === 'off') {
      if (manual) say('ИИ выключен');
      return;
    }
    if (aiRunning.includes(item.id)) return;
    const projectId = projectIdOverride !== undefined ? projectIdOverride : (activeProject === 'all' ? null : activeProject);
    setAiRunning((p) => [...p, item.id]);
    try {
      const res = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageUrl: item.src || item.thumb, projectId }),
      });
      const result = await res.json();
      if (typeof result.creditsRemaining === 'number') setProgress((current) => current ? { ...current, aiCredits: result.creditsRemaining } : current);
      if (!res.ok) return say(result.error || 'ИИ-анализ не сработал');
      await placeAutomatically(item, result, projectId, provisional);
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
    // Фиксируем проект-назначение один раз на весь батч — если во время
    // долгой пакетной загрузки пользователь успеет перейти в другой раздел,
    // уже стартовавшая загрузка не должна "поплыть" за навигацией.
    const destinationProjectId = activeProject === 'all' ? null : activeProject;
    const destinationLabel = destination
      ? collections.find((c) => c.id === destination)?.name || 'борд'
      : destinationProjectId
        ? projects.find((p) => p.id === destinationProjectId)?.name || 'проект'
        : 'Всё';
    // No board picked, but uploading inside a project: give the card a real
    // board right away (reuse the project's first board, or create "Board 1")
    // so it's visible immediately, whether or not AI is on, has credits, or
    // ever runs (videos never get analyzed at all). AI can still move a
    // provisional card into a smarter board afterwards.
    const provisional = destination === null && destinationProjectId !== null;
    let fallbackBoardId: string | null = null;
    if (provisional) {
      try { fallbackBoardId = (await resolveDefaultBoard(destinationProjectId!)).id; } catch { fallbackBoardId = null; }
    }

    setUpload({ done: 0, total: list.length, label: destinationLabel });
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
            collectionId: destination ?? fallbackBoardId,
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
        if (!isVideo && aiMode !== 'off') void analyzeImage(real, false, destinationProjectId, provisional);
      } catch (error) {
        say(`${file.name}: ${error instanceof Error ? error.message : 'файл не загрузился'}`);
      }
      setUpload({ done: n + 1, total: list.length, label: destinationLabel });
    }
    setUpload(null);
    if (succeeded) say(`${succeeded} ${succeeded === 1 ? 'файл добавлен' : 'файла добавлено'}`);
  }

  useEffect(() => { addFilesRef.current = addFiles; });

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

  async function saveProject(name: string, color: string, accessMode?: Project['access_mode']) {
    const editingProject = projectModal === 'new' ? null : projectModal;
    const res = await fetch(editingProject ? `/api/projects/${editingProject.id}` : '/api/projects', {
      method: editingProject ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, color, accessMode }),
    });
    if (!res.ok) return say('Не удалось сохранить проект');
    const project: Project = await res.json();
    setProjects((current) => editingProject ? current.map((value) => value.id === project.id ? project : value) : [...current, project]);
    if (!editingProject) setActiveProject(project.id);
    setProjectModal(null);
  }

  async function makeProjectPublic(project: Project) {
    const res = await fetch(`/api/projects/${project.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accessMode: 'link' }) });
    if (!res.ok) return say('Не удалось опубликовать проект');
    const updated: Project = await res.json();
    setProjects((current) => current.map((value) => value.id === updated.id ? updated : value));
    say('Проект опубликован');
  }

  async function deleteProject(project: Project) {
    // Удаление проекта каскадно сносит все его борды и все карточки в них.
    const boardIds = new Set(collections.filter((c) => c.project_id === project.id).map((c) => c.id));
    setProjects((current) => current.filter((value) => value.id !== project.id));
    setCollections((current) => current.filter((value) => value.project_id !== project.id));
    setItems((current) => current.filter((item) => !item.collection_id || !boardIds.has(item.collection_id)));
    if (activeProject === project.id) setActiveProject('all');
    if (boardIds.has(active)) setActive('all');
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

  async function finishBoardDrag(event: DragEndEvent) {
    const boardId = String(event.active.id);
    const over = event.over;
    setDraggingBoard(null);
    if (!over) return;
    const targetContainer = String(over.data.current?.containerId || over.id).replace(/^container:/, '');
    const targetProjectId = targetContainer === 'unassigned' ? null : targetContainer;
    if (targetProjectId && !projects.some((project) => project.id === targetProjectId)) return;
    const moving = collections.find((board) => board.id === boardId);
    if (!moving) return;

    const targetOriginal = boardsForProject(targetProjectId);
    const sourceIndex = targetOriginal.findIndex((board) => board.id === boardId);
    let insertAt = over.data.current?.type === 'board' ? targetOriginal.findIndex((board) => board.id === String(over.id)) : targetOriginal.length;
    if (insertAt < 0) insertAt = targetOriginal.length;
    if (sourceIndex >= 0 && sourceIndex < insertAt) insertAt--;
    const ordered = targetOriginal.filter((board) => board.id !== boardId);
    ordered.splice(Math.max(0, insertAt), 0, { ...moving, project_id: targetProjectId });
    const positions = new Map(ordered.map((board, index) => [board.id, index]));
    const snapshot = collections;
    const next = collections.map((board) => positions.has(board.id) ? { ...board, project_id: targetProjectId, position: positions.get(board.id)! } : board);
    setCollections(next);
    try {
      const responses = await Promise.all(ordered.map((board, position) => fetch(`/api/collections/${board.id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectId: targetProjectId, position }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error('board reorder failed');
      say(moving.project_id === targetProjectId ? 'Порядок бордов сохранён' : targetProjectId ? 'Борд перемещён в проект' : 'Борд вынесен из проекта');
    } catch {
      setCollections(snapshot);
      say('Не удалось сохранить перемещение');
    }
  }

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    location.href = '/login';
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

  async function uploadProjectCover(file?: File) {
    if (!file || !file.type.startsWith('image/') || !currentProject) return;
    const projectId = currentProject.id;
    try {
      const resized = await shrink(file, 1600, .86);
      const signedResponse = await fetch('/api/upload-url', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ext: 'webp', contentType: 'image/webp', withThumb: false }) });
      const signed = await signedResponse.json();
      const uploadResponse = await fetch(signed.putUrl, { method: 'PUT', headers: { 'content-type': 'image/webp' }, body: resized.blob });
      if (!uploadResponse.ok) throw new Error();
      const response = await fetch(`/api/projects/${projectId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ coverUrl: signed.src }) });
      if (!response.ok) throw new Error();
      const project: Project = await response.json();
      setProjects((p) => p.map((value) => value.id === project.id ? project : value));
      say('Обложка обновлена');
    } catch { say('Не удалось загрузить обложку'); }
  }

  async function deleteCollection(c: Collection) {
    // Удаление борда каскадно сносит все его карточки.
    setCollections((p) => p.filter((x) => x.id !== c.id));
    setItems((p) => p.filter((i) => i.collection_id !== c.id));
    collectionCreationRef.current.clear();
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
      return addFilesRef.current(files);
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

  const title = active === 'all' ? (activeProject === 'all' ? 'Всё' : projects.find((project) => project.id === activeProject)?.name || 'Всё') : active === 'fav' ? 'Избранное' : active === 'projects' ? 'Мои проекты' : collections.find((c) => c.id === active)?.name ?? 'Всё';

  const cardRuntime = useRef({ selected, setSelected, setLightbox, patch, aiRunning, analyzeImage, setEditing, restoreItem, setDisposing, setSizePicker, moveMode });
  cardRuntime.current = { selected, setSelected, setLightbox, patch, aiRunning, analyzeImage, setEditing, restoreItem, setDisposing, setSizePicker, moveMode };

  // Keep the component type stable across Wall renders. Defining a regular
  // nested component here caused React to remount every video whenever account,
  // progress or grid state changed, making posters flash and media reload.
  const Card = useRef(function StableCard({ item }: { item: Item }) {
    const runtime = cardRuntime.current;
    const [playing, setPlaying] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);

    const isMedia = item.kind === 'image' || item.kind === 'video';
    const size = elementSize(item.display_size);
    const crop = pinCrop(item);
    return (
      <div
        className={`card ${isBlock(item) ? 'block-card' : 'pin-card'}${runtime.selected.has(item.id) ? ' selected' : ''}`}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, iframe, .resize')) return;
          if (e.metaKey || e.ctrlKey || e.shiftKey || runtime.selected.size) {
            e.stopPropagation();
            runtime.setSelected((current) => { const next = new Set(current); next.has(item.id) ? next.delete(item.id) : next.add(item.id); return next; });
            return;
          }
          if (isMedia) runtime.setLightbox(item.id);
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
        {isWidgetKind(item.kind) && (
          <div className="content-block widget-block" onClick={(e) => e.stopPropagation()}>
            {item.kind === 'widget_calendar'
              ? <CalendarWidget settings={parseWidgetSettings(item.note)} />
              : <WeatherWidget settings={parseWidgetSettings(item.note)} />}
          </div>
        )}

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
          onClick={(e) => { e.stopPropagation(); runtime.patch(item.id, { fav: !item.fav }); }}>
          {item.fav ? '★' : '☆'}
        </button>

        <div className="tools">
          {item.kind === 'image' && <button className="ai-tool" aria-label="Проанализировать изображение" title="Проанализировать изображение" disabled={runtime.aiRunning.includes(item.id)} onClick={(e) => { e.stopPropagation(); runtime.analyzeImage(item, true); }}>{runtime.aiRunning.includes(item.id) ? '…' : 'AI'}</button>}
          {isBlock(item) && <button className="size-tool" aria-label="Размер элемента" title="Размер элемента" onClick={(e) => { e.stopPropagation(); runtime.setSizePicker(item); }}>{size}</button>}
          {item.url && <button aria-label="Открыть оригинал" onClick={(e) => { e.stopPropagation(); window.open(item.url!, '_blank', 'noopener'); }}>↗</button>}
          <button aria-label="Редактировать карточку" onClick={(e) => { e.stopPropagation(); runtime.setEditing(item); }}><Icon name="edit" /></button>
          {item.archived_at ? <button aria-label="Восстановить карточку" title="Восстановить" onClick={(e) => { e.stopPropagation(); void runtime.restoreItem(item); }}><Icon name="restore" /></button> : <button className="del" aria-label="Удалить или архивировать карточку" onClick={(e) => { e.stopPropagation(); runtime.setDisposing(item); }}><Icon name="trash" /></button>}
        </div>

        {runtime.moveMode && <div className="grip" title="Переместить"><span>⠿</span> Переместить</div>}

        {(item.kind === 'html' || (item.kind === 'embed' && !item.ratio)) && (
          <div className="resize" onPointerDown={(e) => {
            e.preventDefault(); e.stopPropagation();
            const box = boxRef.current!;
            const startY = e.clientY, startH = box.offsetHeight;
            const move = (ev: PointerEvent) => { box.style.height = Math.max(140, startH + ev.clientY - startY) + 'px'; };
            const up = () => {
              runtime.patch(item.id, { embedH: box.offsetHeight });
              window.removeEventListener('pointermove', move);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
          }} />
        )}
      </div>
    );
  }).current;

  return (
    <div className={'app' + (moveMode ? ' move-mode' : '')}>
      <aside className={'sidebar' + (menuOpen ? ' open' : '') + (sidebarCollapsed ? ' collapsed' : '')}>
        <div className="sidebar-head">
          <button className="brand brand-home" aria-label="На главную" data-tooltip="embeddd" onClick={() => { setActiveProject('all'); setActive('all'); setSelectedTag(null); setSearch(''); setMenuOpen(false); }}><img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b></button>
          <button className="sidebar-collapse" aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'} title={sidebarCollapsed ? 'Развернуть меню' : 'Свернуть меню'} onClick={toggleSidebarCollapsed}>{sidebarCollapsed ? '»' : '«'}</button>
        </div>
        <div className="nav">
          {activeProject !== 'all' ? <>
            <div className="project-workspace">
              <button aria-label="Все проекты" onClick={() => { setActiveProject('all'); setActive('all'); }}><Icon name="back" /></button>
              <div><b>{projects.find((project) => project.id === activeProject)?.name}</b><small>{projectCollections.length} {plural(projectCollections.length, 'борд', 'борда', 'бордов')}</small></div>
              <button aria-label="Настройки проекта" onClick={() => { const project = projects.find((value) => value.id === activeProject); if (project) setProjectModal(project); }}><Icon name="settings" /></button>
            </div>
            <div className="nav-label figma-pages"><span>Борды</span><div className="nav-label-actions"><button aria-label="Объединить похожие борды" title="Объединить похожие борды" onClick={() => void autoMergeSimilarBoards()}><Icon name="merge" /></button><button aria-label="Новый борд" onClick={() => setCollModal('new')}><Icon name="plus" /></button></div></div>
            {projectCollections.map((c) => <NavRow key={c.id} id={c.id} name={c.name} color={c.color} count={countOf(c.id)} coll={c} />)}
            {!projectCollections.length && <div className="nav-empty">Пока нет бордов</div>}
          </> : <>
            <DndContext sensors={boardSensors} collisionDetection={closestCenter} onDragStart={(event) => setDraggingBoard(String(event.active.id))} onDragCancel={() => setDraggingBoard(null)} onDragEnd={(event) => void finishBoardDrag(event)}>
            {!!projects.length && <>
              <div className="nav-label figma-pages"><span>Мои проекты</span><button aria-label="Новый проект" onClick={() => setProjectModal('new')}><Icon name="plus" /></button></div>
              {projects.map((project) => { const projectBoards = boardsForProject(project.id); const expanded = !collapsedProjects.has(project.id); return <BoardDropZone key={project.id} id={project.id}>
                <button className="project-row project-heading" data-tooltip={project.name} onClick={() => { setActiveProject(project.id); setActive('all'); }}>
                  <Icon name="folder" /><b>{project.name}</b>
                  <i className={'project-heading-toggle' + (expanded ? '' : ' is-collapsed')} aria-label={expanded ? 'Свернуть проект' : 'Развернуть проект'} onClick={(event) => { event.stopPropagation(); toggleProjectExpanded(project.id); }}><Icon name="chevron" /></i>
                  <i onClick={(event) => { event.stopPropagation(); setProjectModal(project); }}>•••</i>
                </button>
                {expanded && <SortableContext items={projectBoards.map((board) => board.id)} strategy={verticalListSortingStrategy}><div className="project-tree-boards">{projectBoards.map((board) => <SortableBoardRow key={board.id} board={board} active={active === board.id} count={countOf(board.id)} onOpen={() => { setActive(board.id); setMenuOpen(false); }} onEdit={() => setCollModal(board)} />)}</div></SortableContext>}
              </BoardDropZone>; })}
            </>}
            <div className="nav-label figma-pages"><span>Мои борды</span><div className="nav-label-actions"><button aria-label="Объединить похожие борды" title="Объединить похожие борды" onClick={() => void autoMergeSimilarBoards()}><Icon name="merge" /></button><button aria-label="Новый борд" onClick={() => setCollModal('new')}><Icon name="plus" /></button></div></div>
            <BoardDropZone id="unassigned"><SortableContext items={unassignedBoards.map((board) => board.id)} strategy={verticalListSortingStrategy}>{unassignedBoards.map((board) => <SortableBoardRow key={board.id} board={board} active={active === board.id} count={countOf(board.id)} onOpen={() => { setActive(board.id); setMenuOpen(false); }} onEdit={() => setCollModal(board)} />)}</SortableContext></BoardDropZone>
            <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>{draggingBoard ? <BoardRowVisual board={collections.find((board) => board.id === draggingBoard)!} count={countOf(draggingBoard)} overlay /> : null}</DragOverlay>
            </DndContext>
            <NavRow id="all" name="Всё" count={countOf('all')} icon="home" />
            <NavRow id="fav" name="Избранное" count={countOf('fav')} icon="favorite" />
            <NavRow id="archive" name="Архив" count={countOf('archive')} icon="archive" />
          </>}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="btn ghost menu-btn" aria-label="Открыть коллекции" onClick={() => setMenuOpen((v) => !v)}>☰</button>
          <div className="title-wrap">
            {projectRootView
              ? <button className="topbar-back" onClick={() => { setActiveProject('all'); setActive('all'); }}><Icon name="back" /> Все проекты</button>
              : <><h1>{title}</h1><p>{selectedTag ? `#${selectedTag} · ` : ''}{visible.length} {plural(visible.length, 'карточка', 'карточки', 'карточек')}</p></>}
          </div>
          {selectedTag && <button className="tag-filter" onClick={() => setSelectedTag(null)}>#{selectedTag} ×</button>}
          <div ref={topSearchRef} className={'top-search' + (searchOpen ? ' open' : '')}>{searchOpen && <input autoFocus value={search} placeholder="Поиск" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setSearch(''); setSearchOpen(false); } }} />}<button className="icon-control" aria-label="Поиск" title="Поиск" onClick={() => { if (searchOpen && search) setSearch(''); else setSearchOpen((value) => !value); }}><Icon name={searchOpen && search ? 'close' : 'search'} /></button></div>
          {active === 'all' && (
            <div className="sort-control">
              <button className="icon-control" aria-label="Порядок ленты" aria-expanded={sortMenuOpen} title="Порядок ленты" onClick={() => setSortMenuOpen((v) => !v)}><Icon name="sort" /></button>
              {sortMenuOpen && <>
                <button className="menu-shield" aria-label="Закрыть меню" onClick={() => setSortMenuOpen(false)} />
                <div className="sort-menu">
                  <button className={feedOrder === 'newest' ? 'on' : ''} onClick={() => { setFeedOrder('newest'); setSortMenuOpen(false); }}><Icon name="check" />Сначала новые</button>
                  <button className={feedOrder === 'oldest' ? 'on' : ''} onClick={() => { setFeedOrder('oldest'); setSortMenuOpen(false); }}><Icon name="check" />Сначала старые</button>
                </div>
              </>}
            </div>
          )}
          <button className={'icon-control move-toggle' + (moveMode ? ' on' : '')} title={moveMode ? 'Завершить перемещение' : 'Переместить'} aria-label={moveMode ? 'Завершить перемещение' : 'Переместить'} aria-pressed={moveMode}
            onClick={() => setMoveMode((value) => !value)}><Icon name={moveMode ? 'check' : 'move'} /></button>
          <button className={'ai-mode-button mode-' + aiMode} aria-pressed={aiMode === 'auto'} disabled={progress?.aiCredits === 0}
            aria-label={aiMode === 'auto' ? 'Выключить ИИ' : 'Включить ИИ'} title={progress?.aiCredits === 0 ? 'Кредиты закончились' : undefined} onClick={() => chooseAiMode(aiMode === 'auto' ? 'off' : 'auto')}><span>AI</span><small className="ai-credit-tooltip">Осталось {progress?.aiCredits ?? '…'} кредитов</small></button>
          {progress?.aiCredits === 0 && <button className="btn ghost credits-topup" title="Начислить 100 AI-кредитов" onClick={() => void topUpCredits()}>+100 кредитов</button>}
          <div className="add-element">
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
                <i />
                <button onClick={() => { setElementMenu(false); setNewElement('widget_calendar'); }}><b>▦</b><span>Календарь<small>Живой виджет с текущей датой</small></span></button>
                <button onClick={() => { setElementMenu(false); setNewElement('widget_weather'); }}><b>☀</b><span>Погода<small>Живой виджет по геолокации</small></span></button>
              </div>
            </>}
          </div>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden
            onChange={(e) => { addFiles([...(e.target.files || [])]); e.target.value = ''; }} />
          <div className="account-control">
            <button className="account-avatar-btn" aria-label="Аккаунт" onClick={() => setAccountOpen(true)}>
              {account?.avatar_url ? <img src={account.avatar_url} alt="" /> : <span>{(account?.nickname || 'E').slice(0, 1).toUpperCase()}</span>}
            </button>
            <div className="account-hover-card">
              <div className="account-hover-card-inner">
                <div className="account-hover-row">
                  <button className="account-hover-action" onClick={() => { setActiveProject('all'); setActive('projects'); setMenuOpen(true); }}><Icon name="folder" /> Мои проекты</button>
                  <button className="account-hover-add" aria-label="Новый проект" title="Новый проект" onClick={(event) => { event.stopPropagation(); setProjectModal('new'); }}><Icon name="plus" /></button>
                </div>
                <div className="account-hover-row">
                  <button className="account-hover-action" onClick={() => { setActiveProject('all'); setActive('all'); setMenuOpen(true); }}><Icon name="board" /> Мои борды</button>
                  <button className="account-hover-add" aria-label="Новый борд" title="Новый борд" onClick={(event) => { event.stopPropagation(); setCollModal('new'); }}><Icon name="plus" /></button>
                </div>
                <button className="account-hover-action" onClick={() => { setActiveProject('all'); setActive('fav'); }}><Icon name="favorite" /> Избранное</button>
                <button className="account-hover-action" onClick={() => { setActiveProject('all'); setActive('archive'); }}><Icon name="archive" /> Архив</button>
                <i className="account-hover-sep" />
                <button className="account-hover-action" onClick={() => setAccountOpen(true)}><Icon name="settings" /> Настройки аккаунта</button>
                <button className="account-hover-action" onClick={logout}><Icon name="logout" /> Выйти</button>
              </div>
            </div>
          </div>
        </header>

        <div className="scroll" onPointerDown={startSelection}>
          {projectRootView && currentProject && (
            <div className="project-hero">
              <div className="project-hero-info">
                <h2>{currentProject.name}</h2>
                <div className="project-hero-meta">
                  <span>С {new Date(currentProject.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                  <span>{projectItemCount} {plural(projectItemCount, 'карточка', 'карточки', 'карточек')}</span>
                  <span>{projectCollections.length} {plural(projectCollections.length, 'борд', 'борда', 'бордов')}</span>
                </div>
                <div className="project-hero-actions">
                  <button className="btn ghost project-hero-edit" onClick={() => setProjectModal(currentProject)}>Изменить проект</button>
                  {currentProject.access_mode === 'link' && currentProject.share_token ? (
                    <button className="project-hero-share" onClick={() => { navigator.clipboard.writeText(`${location.origin}/${encodeURIComponent(account?.nickname || 'embeddd')}/${currentProject.slug}`); say('Ссылка скопирована'); }}>
                      Ссылка на проект: <b>{(typeof window !== 'undefined' ? window.location.host : '')}/{account?.nickname || 'embeddd'}/{currentProject.slug}</b>
                    </button>
                  ) : (
                    <button className="btn ghost" onClick={() => void makeProjectPublic(currentProject)}>Сделать публичным</button>
                  )}
                </div>
              </div>
              <div className="project-hero-cover">
                {currentProject.cover_url ? <img src={currentProject.cover_url} alt="" /> : projectCoverThumbs.length ? (
                  <div className={'project-hero-mosaic count-' + projectCoverThumbs.length}>
                    {projectCoverThumbs.map((item) => <img key={item.id} src={item.thumb || item.src || ''} alt="" />)}
                  </div>
                ) : <div className="project-hero-cover-empty" />}
                <div className="project-hero-cover-actions">
                  <button aria-label="Загрузить обложку" title="Загрузить обложку" onClick={() => coverRef.current?.click()}><Icon name="plus" /></button>
                  <button aria-label="Настройки проекта" title="Настройки проекта" onClick={() => setProjectModal(currentProject)}><Icon name="edit" /></button>
                </div>
                <input ref={coverRef} type="file" accept="image/*" hidden onChange={(event) => { void uploadProjectCover(event.target.files?.[0]); event.target.value = ''; }} />
              </div>
            </div>
          )}
          {projectRootView && (
            <div className="project-tabs">
              <button className={contentTab === 'all' ? 'on' : ''} onClick={() => setContentTab('all')}>Все</button>
              <button className={contentTab === 'boards' ? 'on' : ''} onClick={() => setContentTab('boards')}>Борды</button>
              <button className={contentTab === 'items' ? 'on' : ''} onClick={() => setContentTab('items')}>Карточки</button>
            </div>
          )}
          <div ref={gridRef} className="grid">
            {projectsGalleryView ? projects.map((project) => {
              const boardCount = boardsForProject(project.id).length;
              const boardIds = new Set(boardsForProject(project.id).map((b) => b.id));
              const covers = items.filter((item) => !item.archived_at && item.collection_id && boardIds.has(item.collection_id) && (item.thumb || item.src)).slice(0, 3);
              const itemWidth = gridMetrics.width ? gridMetrics.width / gridMetrics.columns : 0;
              return <div key={project.id} className="grid-item collection-board-item" data-card-id={`project-${project.id}`} style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className="grid-item-content collection-board">
                  <button className="board-open" aria-label={`Открыть ${project.name}`} onClick={() => { setActiveProject(project.id); setActive('all'); }} />
                  <span className="board-covers">
                    {project.cover_url ? <img className="board-cover cover-1" src={project.cover_url} alt="" loading="lazy" />
                      : covers.length ? covers.map((cover, index) => <img key={cover.id} className={`board-cover cover-${index + 1}`} src={cover.thumb || cover.src || ''} alt="" loading="lazy" />)
                      : <span className="board-empty" style={{ background: project.color }} />}
                  </span>
                  <strong>{project.name}</strong>
                  <small>{boardCount} {plural(boardCount, 'борд', 'борда', 'бордов')}</small>
                  <button className="board-menu" aria-label="Настройки проекта" onClick={() => setProjectModal(project)}>•••</button>
                </div>
              </div>;
            }) : feedEntries.map((entry) => {
              if (entry.type === 'collection') {
                const collection = entry.value;
              const covers = items.filter((item) => item.collection_id === collection.id && (item.thumb || item.src)).slice(0, 3);
              const itemWidth = gridMetrics.width ? gridMetrics.width / gridMetrics.columns : 0;
              const boardKey = `board:${collection.id}`;
              return <div key={`board-${collection.id}`} className="grid-item collection-board-item" data-card-id={boardKey} style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className={'grid-item-content collection-board' + (selected.has(boardKey) ? ' selected' : '')}>
                  <button className="board-open" aria-label={`Открыть ${collection.name}`} onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || selected.size) {
                      e.stopPropagation();
                      setSelected((current) => { const next = new Set(current); next.has(boardKey) ? next.delete(boardKey) : next.add(boardKey); return next; });
                      return;
                    }
                    setActive(collection.id);
                  }} />
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
              const blockSpan = isBlock(it) ? elementSize(it.display_size) === 'XL' ? gridMetrics.columns : elementSize(it.display_size) === 'L' ? 3 : elementSize(it.display_size) === 'M' ? 2 : 1 : 1;
              const span = Math.min(blockSpan, gridMetrics.columns);
              const itemWidth = gridMetrics.width ? gridMetrics.width * span / gridMetrics.columns : 0;
              return <div key={it.id} className={`grid-item ${isBlock(it) ? `element-item element-size-${elementSize(it.display_size).toLowerCase()}` : 'pin-item'}`} data-card-id={it.id} style={itemWidth ? { width: `${itemWidth}px` } : undefined}>
                <div className="grid-item-content"><Card item={it} /></div>
              </div>
            })}
          </div>
          {projectsGalleryView ? (!projects.length && (
            <div className="empty">
              <h2>Пока нет проектов.</h2>
              <p>Нажми «+» рядом с «Мои проекты» в меню слева, чтобы создать первый.</p>
            </div>
          )) : !visible.length && !(active === 'all' && collections.length) && (
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
          <button className="size-tool" aria-label="Размер выбранных элементов" title="Размер выбранных элементов" onClick={() => setBulkSizeOpen(true)}>Размер</button>
          <i />
        </>}
        <select aria-label="Переместить выбранные" defaultValue="" onChange={(e) => moveSelected(e.target.value)}>
          <option value="" disabled>В коллекцию...</option>
          <option value="__none__">Без коллекции</option>
          {collections.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {[...selected].filter((id) => id.startsWith('board:')).length >= 2 && <button onClick={mergeSelectedBoards}>Объединить</button>}
        <button className="selection-delete" onClick={deleteSelected}>Удалить</button>
        <button aria-label="Снять выделение" onClick={() => setSelected(new Set())}>×</button>
      </div>}

      {editing && <EditModal item={editing} />}
      {sizePicker && <SizePickerModal value={elementSize(sizePicker.display_size)} onChange={(v) => patch(sizePicker.id, { displaySize: v })} onConfirm={() => setSizePicker(null)} onClose={() => setSizePicker(null)} />}
      {bulkSizeOpen && <SizePickerModal value={bulkSize} onChange={setBulkSize} onConfirm={() => { resizeSelected(bulkSize); setBulkSizeOpen(false); }} onClose={() => setBulkSizeOpen(false)} />}
      {disposing && <div className="overlay on" onClick={(event) => { if (event.target === event.currentTarget) setDisposing(null); }}><div className="modal dispose-modal"><h3>Что сделать с карточкой?</h3><p>В архиве она будет храниться 30 дней, затем удалится окончательно.</p><div className="dispose-actions"><button onClick={() => archiveItem(disposing)}><Icon name="archive" /><span><b>Архивировать</b><small>Можно восстановить в течение 30 дней</small></span></button><button className="danger" onClick={() => { const item = disposing; setDisposing(null); void remove(item); }}><Icon name="trash" /><span><b>Удалить навсегда</b><small>Файл сразу удалится из хранилища</small></span></button></div><div className="modal-foot"><button className="btn ghost" onClick={() => setDisposing(null)}>Отмена</button></div></div></div>}
      {collModal && <CollModal />}
      {projectModal && <ProjectModal />}
      {accountOpen && <AccountModal />}
      {newElement && (isWidgetKind(newElement) ? <WidgetSettingsModal kind={newElement} /> : <NewElementModal kind={newElement} />)}
      {lightbox && <Lightbox />}

      {upload && (
        <div className="upload-bar">
          Загружаю {upload.done}/{upload.total} в «{upload.label}»
          <span className="bar"><i style={{ width: `${(upload.done / upload.total) * 100}%` }} /></span>
        </div>
      )}

      {aiCardShow && (
        <div className="ai-progress-card" role="status" aria-live="polite">
          <span className="ai-progress-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c.5 3.4 2.4 5.3 5.8 5.8-3.4.5-5.3 2.4-5.8 5.8-.5-3.4-2.4-5.3-5.8-5.8C9.6 8.3 11.5 6.4 12 3Z" /></svg></span>
          <div className="ai-progress-body">
            <div className="ai-progress-head">
              <b>{aiActive ? `Анализирую${aiRunning.length > 1 ? ` (${aiRunning.length})` : ''}…` : 'Готово'}</b>
              <span>{Math.round(aiCardPercent)}%</span>
            </div>
            <div className="ai-progress-bar">
              {Array.from({ length: 14 }).map((_, i) => <i key={i} className={i < Math.round((aiCardPercent / 100) * 14) ? 'on' : ''} />)}
            </div>
          </div>
        </div>
      )}

      <div className={'toast' + (toast ? ' on' : '')}>
        <span>{toast?.msg}</span>
        {toast?.undo && <button onClick={() => { toast.undo!(); setToast(null); }}>Вернуть</button>}
      </div>
    </div>
  );

  /* ---------------- вложенные компоненты ---------------- */

  function NavRow({ id, name, color, count, coll, compact = false, onAdd, addLabel, icon }: { id: Active; name: string; color?: string; count: number; coll?: Collection; compact?: boolean; onAdd?: () => void; addLabel?: string; icon?: 'home' | 'favorite' | 'archive' }) {
    return (
      <div
        data-collection-drop={id}
        data-tooltip={name}
        className={'coll' + (active === id ? ' active' : '') + (compact ? ' compact' : '') + (draggingBoard === coll?.id ? ' board-dragging' : '')}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('.coll-edit')) return;
          setActive(id); setMenuOpen(false);
        }}
      >
        {icon ? <Icon name={icon} className="coll-icon" /> : <span className="coll-dot" style={color ? { background: color } : undefined} />}
        <span className="coll-name">{name}</span>
        {onAdd && <button className="coll-edit" aria-label={addLabel || 'Добавить'} onClick={(e) => { e.stopPropagation(); onAdd(); }}><Icon name="plus" /></button>}
        {coll && <button className="coll-edit" onClick={() => setCollModal(coll)}>⋯</button>}
      </div>
    );
  }


  function NewElementModal({ kind }: { kind: Exclude<NewElement, WidgetKind> }) {
    const [value, setValue] = useState('');
    const [icon, setIcon] = useState('💡');
    const [textStyle, setTextStyle] = useState<TextStyle>('p');
    const [size, setSize] = useState<ElementSize>('S');
    const [pickingSize, setPickingSize] = useState(false);
    const names: Record<Exclude<NewElement, WidgetKind>, string> = { link: 'Ссылка / Embed', text: 'Текст', callout: 'Callout', html: 'HTML' };
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
          {kind !== 'link' && <div className="field"><label>Размер элемента</label><button type="button" className="size-field-trigger" onClick={() => setPickingSize(true)}><b>{size}</b><span>{SIZE_PRESETS.find((p) => p.value === size)?.label}</span></button></div>}
          <div className="field"><label>{kind === 'link' ? 'URL' : kind === 'html' ? 'Код' : 'Содержание'}</label>
            {kind === 'link' ? <input value={value} autoFocus placeholder="https://…" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
              : <textarea value={value} autoFocus rows={kind === 'html' ? 10 : 5} placeholder={kind === 'html' ? '<div>…</div>' : 'Начни писать…'} onChange={(e) => setValue(e.target.value)} />}
          </div>
          <div className="modal-foot"><button className="btn ghost" onClick={() => setNewElement(null)}>Отмена</button><button className="btn" onClick={submit}>Добавить</button></div>
        </div>
        {pickingSize && <SizePickerModal value={size} onChange={setSize} onConfirm={() => setPickingSize(false)} onClose={() => setPickingSize(false)} />}
      </div>
    );
  }

  function WidgetSettingsModal({ kind }: { kind: WidgetKind }) {
    const [theme, setTheme] = useState<WidgetSettings['theme']>('dark');
    const [accent, setAccent] = useState(WIDGET_ACCENTS[0]);
    const title = kind === 'widget_calendar' ? 'Календарь' : 'Погода';

    return (
      <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setNewElement(null); }}>
        <div className="widget-settings-modal">
          <div className="widget-settings-head">
            <button aria-label="Назад" onClick={() => setNewElement(null)}><Icon name="back" /></button>
            <h3>{title}</h3>
            <button className="widget-settings-save" onClick={() => addBlock(kind, title, JSON.stringify({ theme, accent }))}>Добавить</button>
          </div>

          <div className="widget-settings-section">
            <div className="widget-settings-label">Оформление</div>
            <div className="widget-settings-theme-cards">
              <button className={theme === 'light' ? 'on' : ''} onClick={() => setTheme('light')}>
                <span className="widget-theme-preview widget-theme-preview-light" />
                <small>Светлая</small>
              </button>
              <button className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>
                <span className="widget-theme-preview widget-theme-preview-dark" />
                <small>Тёмная</small>
              </button>
            </div>
          </div>

          <div className="widget-settings-section widget-settings-row">
            <div className="widget-settings-label">Акцентный цвет</div>
            <div className="widget-settings-swatches">
              {WIDGET_ACCENTS.map((c) => (
                <button key={c} className={accent === c ? 'on' : ''} style={{ background: c }} aria-label={c} onClick={() => setAccent(c)} />
              ))}
            </div>
          </div>

          <div className="widget-settings-preview">
            {kind === 'widget_calendar' ? <CalendarWidget settings={{ theme, accent }} /> : <WeatherWidget settings={{ theme, accent }} />}
          </div>
        </div>
      </div>
    );
  }

  function EditModal({ item }: { item: Item }) {
    const [t, setT] = useState(item.title || '');
    const [n, setN] = useState(item.note || '');
    const [c, setC] = useState(item.collection_id || '');
    const [size, setSize] = useState<ElementSize>(elementSize(item.display_size));
    const [pickingSize, setPickingSize] = useState(false);
    const [textStyle, setTextStyle] = useState<TextStyle>(item.text_style || 'p');
    const [tags, setTags] = useState((item.tags || []).join(', '));
    const initialWidget = parseWidgetSettings(item.note);
    const [widgetTheme, setWidgetTheme] = useState<WidgetSettings['theme']>(initialWidget.theme);
    const [widgetAccent, setWidgetAccent] = useState(initialWidget.accent);

    if (isWidgetKind(item.kind)) {
      const title = item.kind === 'widget_calendar' ? 'Календарь' : 'Погода';
      return (
        <div className="overlay on" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="widget-settings-modal">
            <div className="widget-settings-head">
              <button aria-label="Назад" onClick={() => setEditing(null)}><Icon name="back" /></button>
              <h3>{title}</h3>
              <button className="widget-settings-save" onClick={() => { patch(item.id, { note: JSON.stringify({ theme: widgetTheme, accent: widgetAccent }) }); setEditing(null); }}>Сохранить</button>
            </div>
            <div className="widget-settings-section">
              <div className="widget-settings-label">Оформление</div>
              <div className="widget-settings-theme-cards">
                <button className={widgetTheme === 'light' ? 'on' : ''} onClick={() => setWidgetTheme('light')}>
                  <span className="widget-theme-preview widget-theme-preview-light" />
                  <small>Светлая</small>
                </button>
                <button className={widgetTheme === 'dark' ? 'on' : ''} onClick={() => setWidgetTheme('dark')}>
                  <span className="widget-theme-preview widget-theme-preview-dark" />
                  <small>Тёмная</small>
                </button>
              </div>
            </div>
            <div className="widget-settings-section widget-settings-row">
              <div className="widget-settings-label">Акцентный цвет</div>
              <div className="widget-settings-swatches">
                {WIDGET_ACCENTS.map((color) => (
                  <button key={color} className={widgetAccent === color ? 'on' : ''} style={{ background: color }} aria-label={color} onClick={() => setWidgetAccent(color)} />
                ))}
              </div>
            </div>
            <div className="widget-settings-preview">
              {item.kind === 'widget_calendar' ? <CalendarWidget settings={{ theme: widgetTheme, accent: widgetAccent }} /> : <WeatherWidget settings={{ theme: widgetTheme, accent: widgetAccent }} />}
            </div>
          </div>
        </div>
      );
    }

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
          {isBlock(item) && <div className="field"><label>Размер элемента</label><button type="button" className="size-field-trigger" onClick={() => setPickingSize(true)}><b>{size}</b><span>{SIZE_PRESETS.find((p) => p.value === size)?.label}</span></button></div>}
          {item.kind === 'text' && <div className="field"><label>Стиль текста</label><div className="text-style-picker">
            {(['p', 'h1', 'h2', 'h3', 'h4', 'h5'] as TextStyle[]).map((value) => <button key={value} className={textStyle === value ? 'on' : ''} onClick={() => setTextStyle(value)}>{value === 'p' ? 'Текст' : value.toUpperCase()}</button>)}
          </div></div>}
          <div className="modal-foot">
            <button className="btn ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="btn" onClick={() => { patch(item.id, { title: t, note: n, tags: tags.split(',').map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean), collectionId: c || null, ...(isBlock(item) ? { displaySize: size } : {}), textStyle }); setEditing(null); }}>Сохранить</button>
          </div>
        </div>
        {pickingSize && <SizePickerModal value={size} onChange={setSize} onConfirm={() => setPickingSize(false)} onClose={() => setPickingSize(false)} />}
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
    const [access, setAccess] = useState<Project['access_mode']>(project?.access_mode || 'private');
    const publicUrl = project?.share_token ? `${location.origin}/${encodeURIComponent(account?.nickname || 'embeddd')}/${project.slug}` : null;
    return <div className="overlay on" onClick={(event) => { if (event.target === event.currentTarget) setProjectModal(null); }}><div className="modal">
      <h3>{project ? 'Проект' : 'Новый проект'}</h3>
      <div className="field"><label>Название</label><input autoFocus value={name} placeholder="Клиент / Бренд / Личное" onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && name.trim() && saveProject(name.trim(), color, access)} /></div>
      <div className="field"><label>Цвет</label><input type="color" value={color} style={{ height: 38, padding: 3 }} onChange={(event) => setColor(event.target.value)} /></div>
      {project && <div className="field"><label>Доступ</label><select value={access} onChange={(event) => setAccess(event.target.value as Project['access_mode'])}>
        <option value="private">Только я</option><option value="link">По ссылке — виден всем</option>
      </select></div>}
      {project && publicUrl && access === 'link' && <button className="share-link" onClick={() => { navigator.clipboard.writeText(publicUrl); say('Ссылка скопирована'); }}>Скопировать публичную ссылку</button>}
      <div className="modal-foot">{project && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={() => deleteProject(project)}>Удалить</button>}<button className="btn ghost" onClick={() => setProjectModal(null)}>Отмена</button><button className="btn" onClick={() => name.trim() && saveProject(name.trim(), color, access)}>{project ? 'Сохранить' : 'Создать'}</button></div>
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
      <div className="account-meta"><span>AI-кредиты <b>{progress?.aiCredits ?? '—'}</b></span><button className="btn ghost" onClick={() => void topUpCredits()}>+100 (тест)</button></div>
      <div className="modal-foot"><button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--danger)' }} onClick={logout}>Выйти</button><button className="btn ghost" onClick={() => setAccountOpen(false)}>Отмена</button><button className="btn" onClick={async () => { await saveAccount({ nickname, email, role, permissions }); setAccountOpen(false); }}>Сохранить</button></div>
    </div></div>;
  }

  function Lightbox() {
    const list = visible.filter((i) => i.kind === 'image' || i.kind === 'video');
    const it = list.find((i) => i.id === lightbox);
    if (!it) return null;
    const [description, setDescription] = useState(it.note || '');
    const [editingDescription, setEditingDescription] = useState(false);
    const [movingCard, setMovingCard] = useState(false);
    const board = collections.find((value) => value.id === it.collection_id);
    const project = projects.find((value) => value.id === board?.project_id);
    const recommendations = items.filter((value) => value.id !== it.id && !value.archived_at && (value.kind === 'image' || value.kind === 'video') && (value.collection_id === it.collection_id || value.tags?.some((tag) => it.tags?.includes(tag)))).slice(0, 6);

    return (
      <div className="lb on" onClick={(event) => { if (event.target === event.currentTarget) setLightbox(null); }}>
        <button className="lb-back" aria-label="Назад" onClick={() => setLightbox(null)}><Icon name="back" /></button>
        <div className="lb-layout"><div className="pin-detail">
          <div className="pin-detail-media">{it.kind === 'video' ? <video src={it.src || ''} poster={it.thumb && it.thumb !== it.src ? it.thumb : undefined} controls autoPlay playsInline preload="metadata" /> : <img src={it.src || it.thumb || ''} alt={it.title || ''} />}<button className={'detail-favorite' + (it.fav ? ' on' : '')} aria-label={it.fav ? 'Убрать из избранного' : 'Добавить в избранное'} title="Избранное" onClick={() => void patch(it.id, { fav: !it.fav })}><Icon name={it.fav ? 'unfavorite' : 'favorite'} /></button></div>
          <div className="pin-detail-info">
            <div className="pin-detail-toolbar">
              <button aria-label="Редактировать" title="Редактировать" onClick={() => { setEditing(it); setLightbox(null); }}><Icon name="edit" /></button>
              <button className={movingCard ? 'on' : ''} aria-label="Переместить" title="Переместить" onClick={() => setMovingCard((value) => !value)}><Icon name="move" /></button>
              <button aria-label="Архивировать" title="Архивировать" onClick={() => { setLightbox(null); void archiveItem(it); }}><Icon name="archive" /></button>
              <button className="danger" aria-label="Удалить" title="Удалить" onClick={() => { setLightbox(null); void remove(it); }}><Icon name="trash" /></button>
            </div>
            {movingCard && <div className="detail-move"><select autoFocus value={it.collection_id || ''} onChange={(event) => { void patch(it.id, { collectionId: event.target.value || null }); setMovingCard(false); }}><option value="">Без борда</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></div>}
            <h2>{it.title || 'Без названия'}</h2>
            <div className="description-field">{editingDescription ? <textarea autoFocus value={description} placeholder="Добавить описание…" onChange={(event) => setDescription(event.target.value)} onBlur={() => { void patch(it.id, { note: description }); setEditingDescription(false); }} /> : <button className={'description-read' + (!description ? ' empty' : '')} onClick={() => setEditingDescription(true)}>{description || 'Добавить описание'}</button>}</div>
            {!!it.tags?.length && <div className="lb-tags">{it.tags.map((tag) => <button key={tag} onClick={(event) => {
            event.stopPropagation(); setSelectedTag(tag); setActive('all'); setLightbox(null);
          }}>#{tag}</button>)}</div>}
            {(project || board) && <div className="detail-location">{project && <button onClick={() => { setLightbox(null); setActiveProject(project.id); setActive('all'); }}><small>Проект</small><b>{project.name}</b></button>}{board && <button onClick={() => { setLightbox(null); setActiveProject(board.project_id || 'all'); setActive(board.id); }}><small>Борд</small><b>{board.name}</b></button>}</div>}
          </div>
        </div>{!!recommendations.length && <aside className="detail-related">{recommendations.map((item) => <button key={item.id} onClick={() => setLightbox(item.id)}>{item.kind === 'video' ? <video muted playsInline preload="metadata" poster={item.thumb && item.thumb !== item.src ? item.thumb : undefined} src={item.src || ''} /> : <img src={item.thumb || item.src || ''} alt="" />}<b>{item.title || 'Без названия'}</b></button>)}</aside>}</div>
      </div>
    );
  }

}

/* ---------------- мелочи ---------------- */

function BoardDropZone({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `container:${id}`, data: { type: 'container', containerId: id } });
  return <div ref={setNodeRef} className={'project-tree' + (isOver ? ' drop' : '')}>{children}</div>;
}

function BoardRowVisual({ board, overlay = false }: { board: Collection; count: number; overlay?: boolean }) {
  return <div className={'coll board-row-visual' + (overlay ? ' board-overlay' : '')} data-tooltip={board.name}>
    <span className="coll-dot" style={{ background: board.color }} /><span className="coll-name">{board.name}</span><span className="board-grip" aria-hidden="true">⠿</span>
  </div>;
}

function SortableBoardRow({ board, active, onOpen, onEdit }: { board: Collection; active: boolean; count: number; onOpen: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id, data: { type: 'board', containerId: board.project_id || 'unassigned' } });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return <div ref={setNodeRef} style={style} data-tooltip={board.name} className={'coll sortable-board' + (active ? ' active' : '') + (isDragging ? ' board-dragging' : '')} onClick={onOpen} {...attributes} {...listeners}>
    <span className="coll-dot" style={{ background: board.color }} /><span className="coll-name">{board.name}</span><button className="coll-edit" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onEdit(); }}>⋯</button><span className="board-grip" aria-hidden="true">⠿</span>
  </div>;
}

function AutoVideo({ src, className, poster }: { src: string; className: string; poster?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [duration, setDuration] = useState(0);
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
  return <><video ref={ref} className={className} draggable={false} muted loop playsInline poster={poster} preload={near ? 'metadata' : 'none'} src={near ? src : undefined}
    onLoadedMetadata={(event) => { setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0); if (!poster && event.currentTarget.duration > .05) event.currentTarget.currentTime = .05; }}
    onMouseEnter={(event) => { void event.currentTarget.play().catch(() => {}); }} onMouseLeave={(event) => event.currentTarget.pause()} />{duration > 0 && <span className="video-duration">{formatDuration(duration)}</span>}</>;
}

function Icon({ name, className }: { name: 'search' | 'close' | 'award' | 'sort' | 'move' | 'check' | 'back' | 'settings' | 'plus' | 'archive' | 'trash' | 'restore' | 'edit' | 'favorite' | 'unfavorite' | 'logout' | 'folder' | 'merge' | 'board' | 'home' | 'chevron'; className?: string }) {
  const paths: Record<typeof name, React.ReactNode> = {
    home: <><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>,
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
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></>,
    favorite: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    unfavorite: <path fill="currentColor" d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></>,
    folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>,
    merge: <><circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.4V13a4 4 0 0 0 4 4h5.6"/></>,
    board: <><rect x="3" y="3" width="8" height="18" rx="2.2"/><rect x="13" y="3" width="8" height="10" rx="2.2"/></>,
  };
  return <svg className={className ? `ui-icon ${className}` : 'ui-icon'} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function plural(n: number, a: string, b: string, c: string) {
  const m = n % 100;
  if (m >= 11 && m <= 14) return c;
  const k = n % 10;
  return k === 1 ? a : k >= 2 && k <= 4 ? b : c;
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const rest = value % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
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
