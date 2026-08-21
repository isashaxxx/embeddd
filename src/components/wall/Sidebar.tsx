'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Account, Active, Collection, Project } from '@/lib/types';
import Icon from './Icon';
import { useCloseOnEscape } from './useCloseOnEscape';

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
  onGoHome: () => void;

  active: Active;
  onSelectActive: (id: Active) => void;
  countAll: number;
  countFav: number;
  countArchive: number;

  projects: Project[];
  activeProject: string;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onEditProject: (project: Project) => void;
  onOpenProjectGallery: () => void;

  boards: Collection[];
  countOfBoard: (id: string) => number;
  onNewBoard: () => void;
  onEditBoard: (board: Collection) => void;
  onMergeSimilar: () => void;
  onReorderBoards: (orderedIds: string[]) => void;

  account: Account | null;
  moveMode: boolean;
  onToggleMoveMode: () => void;
  onOpenAccountSettings: () => void;
  onLogout: () => void;
};

/** Единственная точка входа боковой панели: свитчер проекта + фиксированная навигация +
 * борды текущего контекста + аккаунт. Раньше это было ~140 строк внутри Wall.tsx с
 * параллельным деревом "Мои проекты" — здесь борды показываются только для одного
 * активного контекста (проект либо "без проекта"), поэтому кросс-контейнерный drag
 * между проектами в сайдбаре больше не нужен (для переноса борда в проект есть явный
 * выбор в настройках борда), а сортировка — обычный однослойный SortableContext. */
export default function Sidebar(props: SidebarProps) {
  const {
    collapsed, mobileOpen, onToggleCollapsed, onCloseMobile, onGoHome,
    active, onSelectActive, countAll, countFav, countArchive,
    projects, activeProject, onSelectProject, onNewProject, onEditProject, onOpenProjectGallery,
    boards, countOfBoard, onNewBoard, onEditBoard, onMergeSimilar, onReorderBoards,
    account, moveMode, onToggleMoveMode, onOpenAccountSettings, onLogout,
  } = props;

  const [draggingBoard, setDraggingBoard] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    setDraggingBoard(null);
    const { active: dragged, over } = event;
    if (!over || dragged.id === over.id) return;
    const oldIndex = boards.findIndex((b) => b.id === dragged.id);
    const newIndex = boards.findIndex((b) => b.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const ordered = [...boards];
    const [moved] = ordered.splice(oldIndex, 1);
    ordered.splice(newIndex, 0, moved);
    onReorderBoards(ordered.map((b) => b.id));
  }

  const currentProject = activeProject === 'all' ? null : projects.find((p) => p.id === activeProject) || null;

  return (
    <aside className={'sidebar' + (mobileOpen ? ' open' : '') + (collapsed ? ' collapsed' : '')}>
      <div className="sidebar-head">
        <button className="brand brand-home" aria-label="На главную" data-tooltip="embeddd" onClick={onGoHome}>
          <img className="brand-mark" src="/logo.svg" alt="" /><b>embeddd</b>
        </button>
        <button className="sidebar-collapse" aria-label={collapsed ? 'Развернуть меню' : 'Свернуть меню'} title={collapsed ? 'Развернуть меню' : 'Свернуть меню'} onClick={onToggleCollapsed}>{collapsed ? '»' : '«'}</button>
      </div>

      <ProjectSwitcher projects={projects} current={currentProject} onSelect={onSelectProject} onNew={onNewProject} onEdit={onEditProject} onOpenGallery={onOpenProjectGallery} />

      <div className="nav">
        <NavItem label="Всё" icon="home" count={countAll} active={active === 'all'} onClick={() => { onSelectActive('all'); onCloseMobile(); }} />
        <NavItem label="Избранное" icon="favorite" count={countFav} active={active === 'fav'} onClick={() => { onSelectActive('fav'); onCloseMobile(); }} />
        <NavItem label="Архив" icon="archive" count={countArchive} active={active === 'archive'} onClick={() => { onSelectActive('archive'); onCloseMobile(); }} />

        <div className="nav-label figma-pages">
          <span>{currentProject ? currentProject.name : 'Борды'}</span>
          <div className="nav-label-actions">
            <button aria-label="Объединить похожие борды" title="Объединить похожие борды" onClick={onMergeSimilar}><Icon name="merge" /></button>
            <button aria-label="Новый борд" onClick={onNewBoard}><Icon name="plus" /></button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter}
          onDragStart={(event) => setDraggingBoard(String(event.active.id))}
          onDragCancel={() => setDraggingBoard(null)}
          onDragEnd={handleDragEnd}>
          <SortableContext items={boards.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            {boards.map((board) => (
              <SortableBoardRow key={board.id} board={board} active={active === board.id} count={countOfBoard(board.id)}
                onOpen={() => { onSelectActive(board.id); onCloseMobile(); }} onEdit={() => onEditBoard(board)} />
            ))}
          </SortableContext>
          <DragOverlay dropAnimation={{ duration: 160, easing: 'ease-out' }}>
            {draggingBoard ? <BoardRowVisual board={boards.find((b) => b.id === draggingBoard)!} /> : null}
          </DragOverlay>
        </DndContext>
        {!boards.length && <div className="nav-empty">Пока нет бордов</div>}
      </div>

      <AccountMenu account={account} moveMode={moveMode} onToggleMoveMode={onToggleMoveMode} onOpenSettings={onOpenAccountSettings} onLogout={onLogout} />
    </aside>
  );
}

function NavItem({ label, icon, count, active, onClick }: { label: string; icon: 'home' | 'favorite' | 'archive'; count: number; active: boolean; onClick: () => void }) {
  return (
    <div data-tooltip={label} className={'coll' + (active ? ' active' : '')} onClick={onClick}>
      <Icon name={icon} className="coll-icon" />
      <span className="coll-name">{label}</span>
      <span className="coll-count">{count}</span>
    </div>
  );
}

function BoardRowVisual({ board }: { board: Collection }) {
  return <div className="coll board-row-visual board-overlay" data-tooltip={board.name}>
    <span className="coll-dot" style={{ background: board.color }} /><span className="coll-name">{board.name}</span><span className="board-grip" aria-hidden="true">⠿</span>
  </div>;
}

function SortableBoardRow({ board, active, count, onOpen, onEdit }: { board: Collection; active: boolean; count: number; onOpen: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: board.id });
  const style: CSSProperties = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div ref={setNodeRef} style={style} data-tooltip={board.name} className={'coll sortable-board' + (active ? ' active' : '') + (isDragging ? ' board-dragging' : '')} onClick={onOpen} {...attributes} {...listeners}>
      <span className="coll-dot" style={{ background: board.color }} />
      <span className="coll-name">{board.name}</span>
      <span className="coll-count">{count}</span>
      <button className="coll-edit" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onEdit(); }}>⋯</button>
      <span className="board-grip" aria-hidden="true">⠿</span>
    </div>
  );
}

function ProjectSwitcher({ projects, current, onSelect, onNew, onEdit, onOpenGallery }: {
  projects: Project[]; current: Project | null; onSelect: (id: string) => void; onNew: () => void; onEdit: (project: Project) => void; onOpenGallery: () => void;
}) {
  const [open, setOpen] = useState(false);
  useCloseOnEscape(open, () => setOpen(false));
  return (
    <div className="sidebar-switcher">
      <button className="sidebar-switcher-btn" data-tooltip={current ? current.name : 'Все борды'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {current ? <span className="sidebar-switcher-dot" style={{ background: current.color }} /> : <Icon name="board" />}
        <b>{current ? current.name : 'Все борды'}</b>
        <Icon name="chevron" className="chev" />
      </button>
      {open && <>
        <button className="menu-shield" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
        <div className="popover sidebar-switcher-popover">
          <button className={!current ? 'on' : ''} onClick={() => { onSelect('all'); setOpen(false); }}><Icon name="board" /> Все борды</button>
          {projects.length > 0 && <i className="popover-sep" />}
          {projects.map((project) => (
            <button key={project.id} className={current?.id === project.id ? 'on' : ''} onClick={() => { onSelect(project.id); setOpen(false); }}>
              <span className="sidebar-switcher-dot" style={{ background: project.color }} /> {project.name}
            </button>
          ))}
          <i className="popover-sep" />
          <button onClick={() => { onOpenGallery(); setOpen(false); }}><Icon name="folder" /> Все проекты</button>
          <button onClick={() => { onNew(); setOpen(false); }}><Icon name="plus" /> Новый проект</button>
          {current && <button onClick={() => { onEdit(current); setOpen(false); }}><Icon name="settings" /> Настройки проекта</button>}
        </div>
      </>}
    </div>
  );
}

function AccountMenu({ account, moveMode, onToggleMoveMode, onOpenSettings, onLogout }: {
  account: Account | null; moveMode: boolean; onToggleMoveMode: () => void; onOpenSettings: () => void; onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  useCloseOnEscape(open, () => setOpen(false));
  return (
    <div className="sidebar-account">
      <button className="account-entry" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {account?.avatar_url ? <img src={account.avatar_url} alt="" /> : <span>{(account?.nickname || 'E').slice(0, 1).toUpperCase()}</span>}
        <div><b>{account?.nickname || 'embeddd'}</b><small>{account?.role === 'owner' ? 'Владелец' : (account?.role || '')}</small></div>
        <Icon name="chevron" />
      </button>
      {open && <>
        <button className="menu-shield" aria-label="Закрыть меню" onClick={() => setOpen(false)} />
        <div className="popover sidebar-account-popover">
          <button className={moveMode ? 'on' : ''} onClick={() => { onToggleMoveMode(); setOpen(false); }}><Icon name={moveMode ? 'check' : 'move'} /> {moveMode ? 'Завершить перемещение' : 'Переместить карточки'}</button>
          <button onClick={() => { onOpenSettings(); setOpen(false); }}><Icon name="settings" /> Настройки аккаунта</button>
          <i className="popover-sep" />
          <button className="danger" onClick={onLogout}><Icon name="logout" /> Выйти</button>
        </div>
      </>}
    </div>
  );
}
