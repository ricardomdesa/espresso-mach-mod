import { useSettings } from '../context/SettingsContext'

export function formatTemp(celsius: number, unit: 'celsius' | 'fahrenheit'): string {
  if (unit === 'fahrenheit') {
    return `${(celsius * 9) / 5 + 32}°F`
  }
  return `${celsius.toFixed(1)}°C`
}

export function formatPressure(bar: number, unit: 'bar' | 'psi'): string {
  if (unit === 'psi') {
    return `${(bar * 14.504).toFixed(1)} psi`
  }
  return `${bar.toFixed(1)} bar`
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 100)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(m)}:${pad(s)}.${pad(ms)}`
}

export function useFormatters() {
  const { tempUnit, pressureUnit } = useSettings()

  return {
    temp: (c: number) => formatTemp(c, tempUnit),
    pressure: (b: number) => formatPressure(b, pressureUnit),
    timer: formatTimer,
  }
}
