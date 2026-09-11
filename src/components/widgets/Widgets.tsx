import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  MapPin,
  Moon,
  Sun,
  type LucideIcon,
} from 'lucide-react'
import { describeCode, fetchForecast, guessCity, localTimezone, type Forecast, type Sky } from '../../lib/weather'
import type { WidgetItem } from '../../types'

interface WidgetProps {
  item: WidgetItem
  onUpdate: (patch: Partial<WidgetItem>) => void
  /** Detail view renders the widget big regardless of the card size. */
  large?: boolean
}

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Hours/minutes/seconds as seen in another time zone. */
function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' })
    .formatToParts(date)
    .reduce<Record<string, number>>((acc, p) => (p.type === 'literal' ? acc : { ...acc, [p.type]: Number(p.value) }), {})
  return { h: parts.hour ?? 0, m: parts.minute ?? 0, s: parts.second ?? 0 }
}

/* ---------- clock ---------- */

function AnalogFace({ h, m, s, dark }: { h: number; m: number; s: number; dark: boolean }) {
  const hand = (deg: number, length: number, width: number, color: string) => (
    <line
      x1="50"
      y1="50"
      x2={50 + length * Math.sin((deg * Math.PI) / 180)}
      y2={50 - length * Math.cos((deg * Math.PI) / 180)}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
    />
  )
  const ink = dark ? '#fff' : '#111'
  return (
    <svg viewBox="0 0 100 100" className="clock-face" aria-hidden>
      <circle cx="50" cy="50" r="48" className="clock-dial" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i * 30 * Math.PI) / 180
        return (
          <line
            key={i}
            x1={50 + 39 * Math.sin(a)}
            y1={50 - 39 * Math.cos(a)}
            x2={50 + 43 * Math.sin(a)}
            y2={50 - 43 * Math.cos(a)}
            stroke={ink}
            strokeOpacity={i % 3 === 0 ? 0.9 : 0.35}
            strokeWidth={i % 3 === 0 ? 2 : 1.2}
            strokeLinecap="round"
          />
        )
      })}
      {hand(((h % 12) + m / 60) * 30, 22, 3.2, ink)}
      {hand((m + s / 60) * 6, 32, 2.2, ink)}
      {hand(s * 6, 36, 1, '#ff6b1a')}
      <circle cx="50" cy="50" r="2.4" fill="#ff6b1a" />
    </svg>
  )
}

export function ClockWidget({ item, large }: WidgetProps) {
  const now = useNow(1000)
  const timeZone = item.city?.timezone ?? localTimezone()
  const { h, m, s } = partsIn(now, timeZone)
  const dark = h < 6 || h >= 19
  const time = new Intl.DateTimeFormat(undefined, { timeZone, hour: '2-digit', minute: '2-digit' }).format(now)
  const date = new Intl.DateTimeFormat(undefined, { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(now)
  const place = item.city?.name ?? timeZone.split('/').pop()?.replace(/_/g, ' ').replace(/^Kiev$/, 'Kyiv')
  const style = item.clockStyle ?? 'analog'

  return (
    <div className={`widget widget-clock ${dark ? 'dark' : 'light'} style-${style}${large ? ' large' : ''}`}>
      {style === 'analog' ? <AnalogFace h={h} m={m} s={s} dark={dark} /> : <div className="clock-digital">{time}</div>}
      <div className="widget-foot">
        <b>{place}</b>
        <span>
          {style === 'analog' ? `${time} · ` : ''}
          {date}
        </span>
      </div>
    </div>
  )
}

/* ---------- weather ---------- */

const SKY_ICON: Record<Sky, LucideIcon> = {
  clear: Sun,
  partly: CloudSun,
  cloudy: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

export function WeatherWidget({ item, onUpdate, large }: WidgetProps) {
  const [forecast, setForecast] = useState<Forecast | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { city, units = 'c' } = item
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  // Start from the city the device's time zone is named after; it can be changed in settings.
  useEffect(() => {
    if (city) return
    guessCity()
      .then((guess) => (guess ? onUpdateRef.current({ city: guess }) : setError('Choose a city in settings')))
      .catch(() => setError('Choose a city in settings'))
  }, [city])

  useEffect(() => {
    if (!city) return
    let alive = true
    const load = () =>
      fetchForecast(city, units)
        .then((data) => alive && (setForecast(data), setError(null)))
        .catch((err: Error) => alive && setError(err.message))
    load()
    const timer = setInterval(load, 15 * 60 * 1000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [city, units])

  if (!forecast) {
    return (
      <div className="widget widget-weather sky-cloudy">
        <div className="widget-foot">
          <b>{city?.name ?? 'Weather'}</b>
          <span>{error ?? 'Loading…'}</span>
        </div>
      </div>
    )
  }

  const { label, sky } = describeCode(forecast.code)
  const Icon = sky === 'clear' && !forecast.isDay ? Moon : SKY_ICON[sky]
  const weekday = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${date}T12:00`))

  return (
    <div className={`widget widget-weather sky-${sky}${forecast.isDay ? '' : ' night'}${large ? ' large' : ''}`}>
      <div className="weather-top">
        <span className="weather-place">
          <MapPin size={13} /> {city?.name}
        </span>
        <Icon className="weather-icon" size={28} strokeWidth={1.6} />
      </div>
      <div className="weather-now">
        <span className="weather-temp">{Math.round(forecast.temperature)}°</span>
        <span className="weather-label">
          {label}
          <small>
            Feels {Math.round(forecast.apparent)}° · H {Math.round(forecast.days[0].max)}° L {Math.round(forecast.days[0].min)}°
          </small>
        </span>
      </div>
      <div className="weather-days">
        {forecast.days.slice(1).map((d) => {
          const DayIcon = SKY_ICON[describeCode(d.code).sky]
          return (
            <div key={d.date} className="weather-day">
              <span>{weekday(d.date)}</span>
              <DayIcon size={16} strokeWidth={1.7} />
              <b>{Math.round(d.max)}°</b>
              <small>{Math.round(d.min)}°</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- calendar ---------- */

export function CalendarWidget({ item, large }: WidgetProps) {
  const now = useNow(60_000)
  const [offset, setOffset] = useState(0)
  const weekStart = item.weekStart ?? 1

  const month = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const days = useMemo(() => {
    const first = (month.getDay() - weekStart + 7) % 7
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    return [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)] as (number | null)[]
  }, [month.getFullYear(), month.getMonth(), weekStart]) // eslint-disable-line react-hooks/exhaustive-deps

  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(new Date(2024, 0, 7 + ((i + weekStart) % 7))),
  )
  const isToday = (d: number | null) => offset === 0 && d === now.getDate()

  return (
    <div className={`widget widget-calendar${large ? ' large' : ''}`}>
      {/* Small cards show today; bigger ones the whole month. */}
      <div className="calendar-today">
        <span className="calendar-weekday">{new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now)}</span>
        <span className="calendar-date">{now.getDate()}</span>
        <span className="calendar-month-name">{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(now)}</span>
      </div>
      <div className="calendar-month">
        <div className="calendar-head">
          <b>{new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(month)}</b>
          <span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOffset((o) => o - 1)
              }}
              aria-label="Previous month"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setOffset((o) => o + 1)
              }}
              aria-label="Next month"
            >
              <ChevronRight size={16} />
            </button>
          </span>
        </div>
        <div className="calendar-grid">
          {weekdayNames.map((name, i) => (
            <span key={`w${i}`} className="calendar-wd">
              {name}
            </span>
          ))}
          {days.map((d, i) => (
            <span key={i} className={`calendar-day${isToday(d) ? ' today' : ''}`}>
              {d}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function WidgetCard(props: WidgetProps) {
  if (props.item.widget === 'clock') return <ClockWidget {...props} />
  if (props.item.widget === 'weather') return <WeatherWidget {...props} />
  return <CalendarWidget {...props} />
}
