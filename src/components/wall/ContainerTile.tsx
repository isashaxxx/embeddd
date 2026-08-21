type Cover = { id: string; src: string };

type ContainerTileProps = {
  name: string;
  color: string;
  metaLabel: string;
  coverUrl?: string | null;
  covers?: Cover[];
  locked?: boolean;
  selected?: boolean;
  onOpen: (event: React.MouseEvent) => void;
  onSettings: () => void;
  settingsLabel: string;
};

/** Плитка контейнера (проект или борд) — используется в BoardStrip и в галерее
 * проектов вместо того, чтобы каждая пере-реализовывала одну и ту же обложку. */
export default function ContainerTile({ name, color, metaLabel, coverUrl, covers = [], locked, selected, onOpen, onSettings, settingsLabel }: ContainerTileProps) {
  return (
    <div className={'collection-board' + (selected ? ' selected' : '')}>
      <button className="board-open" aria-label={`Открыть ${name}`} onClick={onOpen} />
      <span className="board-covers">
        {coverUrl
          ? <img className="board-cover cover-1" src={coverUrl} alt="" loading="lazy" />
          : covers.length
            ? covers.map((cover, index) => <img key={cover.id} className={`board-cover cover-${index + 1}`} src={cover.src} alt="" loading="lazy" />)
            : <span className="board-empty" style={{ background: color }} />}
        {locked && <span className="board-lock" aria-label="Закрытая коллекция">🔒</span>}
      </span>
      <strong>{name}</strong>
      <small>{metaLabel}</small>
      <button className="board-menu" aria-label={settingsLabel} title={settingsLabel} onClick={onSettings}>•••</button>
    </div>
  );
}
