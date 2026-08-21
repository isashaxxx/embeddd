'use client';
import { useState } from 'react';
import type { CSSProperties } from 'react';

export type WidgetSettings = { theme: 'light' | 'dark'; accent: string };

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

export default function CalendarWidget({ settings }: { settings: WidgetSettings }) {
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7; // неделя с понедельника
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const dayNum = i - startOffset + 1;
    if (dayNum < 1) return { day: daysInPrevMonth + dayNum, current: false };
    if (dayNum > daysInMonth) return { day: dayNum - daysInMonth, current: false };
    return { day: dayNum, current: true };
  });

  const isToday = (day: number, current: boolean) =>
    current && year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  return (
    <div className={`widget widget-calendar widget-${settings.theme}`} style={{ '--widget-accent': settings.accent } as CSSProperties}>
      <div className="widget-cal-head">
        <button aria-label="Предыдущий месяц" onClick={(e) => { e.stopPropagation(); setCursor(new Date(year, month - 1, 1)); }}>‹</button>
        <b>{MONTHS[month]} {year}</b>
        <button aria-label="Следующий месяц" onClick={(e) => { e.stopPropagation(); setCursor(new Date(year, month + 1, 1)); }}>›</button>
      </div>
      <div className="widget-cal-weekdays">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="widget-cal-grid">
        {cells.map((cell, i) => (
          <span key={i} className={'widget-cal-day' + (cell.current ? '' : ' is-outside') + (isToday(cell.day, cell.current) ? ' is-today' : '')}>
            {cell.day}
          </span>
        ))}
      </div>
    </div>
  );
}
