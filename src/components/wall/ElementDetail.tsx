'use client';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ChecklistItem, Collection, Item, Project } from '@/lib/types';
import Icon from './Icon';

type ElementDetailProps = {
  item: Item;
  board?: Collection;
  project?: Project;
  related: Item[];
  relatedTitle: string;
  collections: Collection[];
  onClose: () => void;
  onOpenHome: () => void;
  onOpenBoard: (board: Collection) => void;
  onOpenProject: (project: Project) => void;
  onOpenRelated: (id: string) => void;
  onToggleFav: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDispose: () => void;
  onMoveTo: (collectionId: string | null) => void;
  onSaveNote: (note: string) => void;
  onChecklistChange: (checklist: ChecklistItem[]) => void;
  onSelectTag: (tag: string) => void;
};

/** Общая "полка" для описания/чек-листа/тегов — одинаковый лейбл и отступ вместо
 * трёх разных: у описания раньше не было подписи вовсе, у чек-листа — серый бокс
 * с подписью, у тегов — просто пилюли без подписи. */
function DetailSection({ label, children }: { label: string; children: ReactNode }) {
  return <div className="detail-section">
    <div className="detail-section-label">{label}</div>
    {children}
  </div>;
}

export default function ElementDetail(props: ElementDetailProps) {
  const {
    item: it, board, project, related, relatedTitle, collections,
    onClose, onOpenHome, onOpenBoard, onOpenProject, onOpenRelated,
    onToggleFav, onEdit, onArchive, onDispose, onMoveTo, onSaveNote, onChecklistChange, onSelectTag,
  } = props;

  const [description, setDescription] = useState(it.note || '');
  const [editingDescription, setEditingDescription] = useState(false);
  const [movingCard, setMovingCard] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState('');
  const checklist = it.checklist || [];

  function addChecklistItem() {
    const text = newChecklistText.trim();
    if (!text) return;
    onChecklistChange([...checklist, { id: crypto.randomUUID(), text, done: false }]);
    setNewChecklistText('');
  }

  return (
    <div className="lb on" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="lb-crumbs">
        <button className="lb-crumb-back" aria-label="Назад" onClick={onClose}><Icon name="back" /></button>
        <button className="lb-crumb" onClick={onOpenHome}>embeddd</button>
        {board && <><span>/</span><button className="lb-crumb" onClick={() => onOpenBoard(board)}>{board.name}</button></>}
        <span>/</span><b className="lb-crumb-current">{it.title || 'Без названия'}</b>
      </div>
      <div className="lb-layout"><div className="pin-detail">
        <div className="pin-detail-media">
          {it.kind === 'video' ? <video src={it.src || ''} poster={it.thumb && it.thumb !== it.src ? it.thumb : undefined} controls autoPlay playsInline preload="metadata" /> : <img src={it.src || it.thumb || ''} alt={it.title || ''} />}
          <button className={'detail-favorite' + (it.fav ? ' on' : '')} aria-label={it.fav ? 'Убрать из избранного' : 'Добавить в избранное'} title="Избранное" onClick={onToggleFav}><Icon name={it.fav ? 'unfavorite' : 'favorite'} /></button>
        </div>
        <div className="pin-detail-info">
          <div className="pin-detail-toolbar">
            <button aria-label="Редактировать" title="Редактировать" onClick={onEdit}><Icon name="edit" /></button>
            <button className={movingCard ? 'on' : ''} aria-label="Переместить" title="Переместить" onClick={() => setMovingCard((value) => !value)}><Icon name="move" /></button>
            <button aria-label="Архивировать" title="Архивировать" onClick={onArchive}><Icon name="archive" /></button>
            <button className="danger" aria-label="Удалить" title="Удалить" onClick={onDispose}><Icon name="trash" /></button>
          </div>
          {movingCard && <div className="detail-move"><select autoFocus value={it.collection_id || ''} onChange={(event) => { onMoveTo(event.target.value || null); setMovingCard(false); }}><option value="">Без борда</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select></div>}
          <h2>{it.title || 'Без названия'}</h2>

          <DetailSection label="Описание">
            <div className="description-field">
              {editingDescription
                ? <textarea autoFocus value={description} placeholder="Добавить описание…" onChange={(event) => setDescription(event.target.value)} onBlur={() => { onSaveNote(description); setEditingDescription(false); }} />
                : <button className={'description-read' + (!description ? ' empty' : '')} onClick={() => setEditingDescription(true)}>{description || 'Добавить описание'}</button>}
            </div>
          </DetailSection>

          <DetailSection label="Чек-лист">
            <div className="detail-checklist">
              {checklist.map((entry) => (
                <label key={entry.id} className="checklist-row">
                  <input type="checkbox" checked={entry.done} onChange={() => onChecklistChange(checklist.map((e) => e.id === entry.id ? { ...e, done: !e.done } : e))} />
                  <span className={entry.done ? 'done' : ''}>{entry.text}</span>
                  <button aria-label="Удалить пункт" onClick={() => onChecklistChange(checklist.filter((e) => e.id !== entry.id))}><Icon name="close" /></button>
                </label>
              ))}
              <div className="checklist-add-row">
                <input value={newChecklistText} placeholder="Добавить пункт" onChange={(event) => setNewChecklistText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addChecklistItem(); }} />
                <button aria-label="Добавить пункт" onClick={addChecklistItem}><Icon name="plus" /></button>
              </div>
            </div>
          </DetailSection>

          {!!it.tags?.length && <DetailSection label="Теги">
            <div className="lb-tags">{it.tags.map((tag) => <button key={tag} onClick={(event) => { event.stopPropagation(); onSelectTag(tag); }}>#{tag}</button>)}</div>
          </DetailSection>}

          {(project || board) && <div className="detail-location">
            {project && <button onClick={() => onOpenProject(project)}><small>Проект</small><b>{project.name}</b></button>}
            {board && <button onClick={() => onOpenBoard(board)}><small>Борд</small><b>{board.name}</b></button>}
          </div>}
        </div>
      </div>{!!related.length && <aside className="detail-related">
        <div className="detail-related-head">{relatedTitle}</div>
        {related.map((item) => <button key={item.id} onClick={() => onOpenRelated(item.id)}>{item.kind === 'video' ? <video muted playsInline preload="metadata" poster={item.thumb && item.thumb !== item.src ? item.thumb : undefined} src={item.src || ''} /> : <img src={item.thumb || item.src || ''} alt="" />}<b>{item.title || 'Без названия'}</b></button>)}
        {board && <button className="detail-related-more" onClick={() => onOpenBoard(board)}>Смотреть все в «{board.name}» →</button>}
      </aside>}</div>
    </div>
  );
}
