'use client';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { WidgetSettings } from './CalendarWidget';

type WeatherState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; temp: number; isDay: boolean; label: string };

function describeWeather(code: number): string {
  if (code === 0) return 'Ясно';
  if (code <= 3) return 'Переменная облачность';
  if (code === 45 || code === 48) return 'Туман';
  if (code >= 51 && code <= 57) return 'Морось';
  if (code >= 61 && code <= 67) return 'Дождь';
  if (code >= 71 && code <= 77) return 'Снег';
  if (code >= 80 && code <= 82) return 'Ливень';
  if (code >= 85 && code <= 86) return 'Снегопад';
  if (code >= 95) return 'Гроза';
  return 'Погода';
}

export default function WeatherWidget({ settings }: { settings: WidgetSettings }) {
  const [state, setState] = useState<WeatherState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    if (!navigator.geolocation) { setState({ status: 'error', message: 'Геолокация недоступна в этом браузере' }); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,is_day`);
          if (!res.ok) throw new Error('bad response');
          const data = await res.json();
          if (cancelled) return;
          setState({
            status: 'ready',
            temp: Math.round(data.current.temperature_2m),
            isDay: data.current.is_day === 1,
            label: describeWeather(data.current.weather_code),
          });
        } catch {
          if (!cancelled) setState({ status: 'error', message: 'Не удалось загрузить погоду' });
        }
      },
      () => { if (!cancelled) setState({ status: 'error', message: 'Разреши геолокацию, чтобы увидеть погоду' }); },
      { timeout: 8000 },
    );
    return () => { cancelled = true; };
  }, [attempt]);

  return (
    <div className={`widget widget-weather widget-${settings.theme}`} style={{ '--widget-accent': settings.accent } as CSSProperties}>
      {state.status === 'loading' && <div className="widget-weather-state">Определяю погоду…</div>}
      {state.status === 'error' && (
        <div className="widget-weather-state">
          <p>{state.message}</p>
          <button onClick={(e) => { e.stopPropagation(); setAttempt((n) => n + 1); }}>Повторить</button>
        </div>
      )}
      {state.status === 'ready' && (
        <>
          <div className="widget-weather-head">
            <b>{state.isDay ? 'День' : 'Ночь'}</b>
            <span>{state.temp}°C</span>
          </div>
          <p className="widget-weather-label">{state.label}</p>
          <div className="widget-weather-arc">
            <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
              <path d="M10,90 Q100,10 190,90" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" opacity=".35" />
            </svg>
            <span className={'widget-weather-orb' + (state.isDay ? ' is-sun' : ' is-moon')} />
          </div>
        </>
      )}
    </div>
  );
}
