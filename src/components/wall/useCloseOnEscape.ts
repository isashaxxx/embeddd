import { useEffect } from 'react';

/** Закрывает локальный попап/оверлей по Escape — для состояния, которое живёт
 * внутри отдельного компонента и не видно глобальному обработчику в Wall.tsx. */
export function useCloseOnEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
}
