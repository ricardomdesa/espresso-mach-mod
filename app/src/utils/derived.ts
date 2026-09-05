import { ShotLog, ShotRecord } from '../api/types'

/** Arredonda pra 1 casa decimal (amostragem de curva, moagem numerica). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Ratio (yield/dose). Nunca persistido (D9) — calculado na renderizacao. */
export function ratio(doseG?: number, yieldG?: number): number | null {
  if (!doseG || !yieldG) return null
  return yieldG / doseG
}

/** Vazao media (g/s). Nunca persistido (D9). */
export function flowRate(yieldG?: number, durationS?: number): number | null {
  if (!yieldG || !durationS) return null
  return yieldG / durationS
}

/** Dias desde a torra. `null` sem data de torra. */
export function restDays(roastDate?: string, at: Date = new Date()): number | null {
  if (!roastDate) return null
  const roast = new Date(roastDate)
  if (Number.isNaN(roast.getTime())) return null
  const msPerDay = 24 * 60 * 60 * 1000
  const roastUtc = Date.UTC(roast.getUTCFullYear(), roast.getUTCMonth(), roast.getUTCDate())
  const atUtc = Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate())
  return Math.round((atUtc - roastUtc) / msPerDay)
}

export interface ShotFieldDiff {
  field: keyof ShotLog
  from: unknown
  to: unknown
}

const DIFFABLE_FIELDS: (keyof ShotLog)[] = [
  'beanId',
  'grindSetting',
  'doseG',
  'distribution',
  'yieldG',
  'firstDropS',
  'taste',
  'channeling',
  'rating',
]

/** Campos de `log` que diferem entre dois shots (RF-16). Ignora ausentes nos dois lados. */
export function diffShots(a: ShotRecord, b: ShotRecord): ShotFieldDiff[] {
  const diffs: ShotFieldDiff[] = []
  for (const field of DIFFABLE_FIELDS) {
    const from = a.log[field]
    const to = b.log[field]
    if (from === undefined && to === undefined) continue
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    diffs.push({ field, from, to })
  }
  return diffs
}
