import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { searchCities } from '../../lib/weather'
import type { City, WidgetItem } from '../../types'
import { Popover, type AnchorPosition } from '../Popover'

interface Props {
  item: WidgetItem
  position: AnchorPosition
  onUpdate: (patch: Partial<WidgetItem>) => void
  onClose: () => void
}

function Segmented<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'active' : ''} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

export function WidgetSettings({ item, position, onUpdate, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<(City & { region?: string })[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      searchCities(query, controller.signal)
        .then(setResults)
        .catch(() => {})
    }, 250)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  return (
    <Popover position={position} className="popover widget-settings" onClose={onClose}>
      {item.widget !== 'calendar' && (
        <>
          <div className="settings-label">City</div>
          <input
            className="popover-input"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={item.city ? `${item.city.name}${item.city.country ? `, ${item.city.country}` : ''}` : 'Search a city…'}
          />
          {results.map((city) => (
            <button
              key={`${city.latitude},${city.longitude}`}
              className="city-option"
              onClick={() => {
                const { region: _region, ...clean } = city
                onUpdate({ city: clean })
                onClose()
              }}
            >
              <MapPin size={14} />
              <span>
                {city.name}
                <small>{[city.region, city.country].filter(Boolean).join(', ')}</small>
              </span>
            </button>
          ))}
          {item.widget === 'clock' && item.city && !query && (
            <button className="city-option" onClick={() => onUpdate({ city: undefined })}>
              <MapPin size={14} />
              <span>Use my time zone</span>
            </button>
          )}
        </>
      )}

      {item.widget === 'clock' && (
        <>
          <div className="settings-label">Style</div>
          <Segmented value={item.clockStyle ?? 'analog'} options={[['analog', 'Analog'], ['digital', 'Digital']]} onChange={(clockStyle) => onUpdate({ clockStyle })} />
        </>
      )}
      {item.widget === 'weather' && (
        <>
          <div className="settings-label">Units</div>
          <Segmented value={item.units ?? 'c'} options={[['c', '°C'], ['f', '°F']]} onChange={(units) => onUpdate({ units })} />
        </>
      )}
      {item.widget === 'calendar' && (
        <>
          <div className="settings-label">Week starts on</div>
          <Segmented value={item.weekStart ?? 1} options={[[1, 'Monday'], [0, 'Sunday']]} onChange={(weekStart) => onUpdate({ weekStart })} />
        </>
      )}
    </Popover>
  )
}
