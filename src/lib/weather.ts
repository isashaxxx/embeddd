import type { City } from '../types'

// Open-Meteo: free, keyless, and CORS-enabled, so widgets call it straight from the browser.

interface GeoResult {
  name: string
  country?: string
  admin1?: string
  latitude: number
  longitude: number
  timezone: string
}

export async function searchCities(query: string, signal?: AbortSignal): Promise<(City & { region?: string })[]> {
  if (query.trim().length < 2) return []
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`,
    { signal },
  )
  if (!res.ok) return []
  const data = (await res.json()) as { results?: GeoResult[] }
  return (data.results ?? []).map((r) => ({
    name: r.name,
    country: r.country,
    region: r.admin1,
    latitude: r.latitude,
    longitude: r.longitude,
    timezone: r.timezone,
  }))
}

export const localTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** A sensible first city without asking for location access: the one the time zone is named after. */
export async function guessCity(): Promise<City | undefined> {
  const tz = localTimezone()
  const name = tz.split('/').pop()?.replace(/_/g, ' ')
  if (!name) return undefined
  const [match] = await searchCities(name === 'Kiev' ? 'Kyiv' : name)
  return match
}

export interface Forecast {
  temperature: number
  apparent: number
  code: number
  isDay: boolean
  wind: number
  days: { date: string; code: number; max: number; min: number }[]
}

const cache = new Map<string, { at: number; data: Forecast }>()

export async function fetchForecast(city: City, units: 'c' | 'f' = 'c'): Promise<Forecast> {
  const key = `${city.latitude},${city.longitude},${units}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.data

  const params = new URLSearchParams({
    latitude: String(city.latitude),
    longitude: String(city.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '6',
    temperature_unit: units === 'f' ? 'fahrenheit' : 'celsius',
  })
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Weather unavailable (${res.status})`)
  const raw = await res.json()
  const data: Forecast = {
    temperature: raw.current.temperature_2m,
    apparent: raw.current.apparent_temperature,
    code: raw.current.weather_code,
    isDay: raw.current.is_day === 1,
    wind: raw.current.wind_speed_10m,
    days: raw.daily.time.map((date: string, i: number) => ({
      date,
      code: raw.daily.weather_code[i],
      max: raw.daily.temperature_2m_max[i],
      min: raw.daily.temperature_2m_min[i],
    })),
  }
  cache.set(key, { at: Date.now(), data })
  return data
}

export type Sky = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'storm'

/** WMO weather interpretation codes, grouped the way people describe the sky. */
export function describeCode(code: number): { label: string; sky: Sky } {
  if (code === 0) return { label: 'Clear', sky: 'clear' }
  if (code === 1) return { label: 'Mainly clear', sky: 'partly' }
  if (code === 2) return { label: 'Partly cloudy', sky: 'partly' }
  if (code === 3) return { label: 'Overcast', sky: 'cloudy' }
  if (code === 45 || code === 48) return { label: 'Fog', sky: 'fog' }
  if (code >= 51 && code <= 57) return { label: 'Drizzle', sky: 'drizzle' }
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: code >= 80 ? 'Rain showers' : 'Rain', sky: 'rain' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', sky: 'snow' }
  if (code >= 95) return { label: 'Thunderstorm', sky: 'storm' }
  return { label: 'Cloudy', sky: 'cloudy' }
}
