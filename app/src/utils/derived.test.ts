import { describe, expect, it } from 'vitest'
import { diffShots, flowRate, ratio, restDays } from './derived'
import { ShotRecord } from '../api/types'

function makeShot(overrides: Partial<ShotRecord['log']> = {}): ShotRecord {
  return {
    id: 'x',
    date: '2026-01-01T00:00:00.000Z',
    duration_s: 30,
    profileName: 'Padrao',
    tempAvg: 93,
    pressAvg: 9,
    schema: 2,
    source: 'manual',
    log: { status: 'done', ...overrides },
  }
}

describe('ratio', () => {
  it('calcula yield/dose', () => {
    expect(ratio(18, 36)).toBe(2)
  })

  it('retorna null com dose zero', () => {
    expect(ratio(0, 36)).toBeNull()
  })

  it('retorna null com dose ou yield ausente', () => {
    expect(ratio(undefined, 36)).toBeNull()
    expect(ratio(18, undefined)).toBeNull()
  })
})

describe('flowRate', () => {
  it('calcula g/s', () => {
    expect(flowRate(36, 30)).toBe(1.2)
  })

  it('retorna null sem tempo', () => {
    expect(flowRate(36, 0)).toBeNull()
    expect(flowRate(36, undefined)).toBeNull()
  })
})

describe('restDays', () => {
  it('conta dias inteiros entre a torra e a data de referencia', () => {
    expect(restDays('2026-01-01', new Date('2026-01-08T15:00:00Z'))).toBe(7)
  })

  it('retorna 0 no mesmo dia', () => {
    expect(restDays('2026-01-01', new Date('2026-01-01T23:00:00Z'))).toBe(0)
  })

  it('retorna null sem data de torra', () => {
    expect(restDays(undefined)).toBeNull()
  })

  it('retorna null com data invalida', () => {
    expect(restDays('nao-e-data')).toBeNull()
  })
})

describe('diffShots', () => {
  it('ignora campos ausentes nos dois lados', () => {
    const a = makeShot()
    const b = makeShot()
    expect(diffShots(a, b)).toEqual([])
  })

  it('reporta campos que mudaram', () => {
    const a = makeShot({ grindSetting: '7', doseG: 18 })
    const b = makeShot({ grindSetting: '8', doseG: 18 })
    expect(diffShots(a, b)).toEqual([{ field: 'grindSetting', from: '7', to: '8' }])
  })

  it('reporta campo que passou de ausente para presente', () => {
    const a = makeShot()
    const b = makeShot({ rating: 4 })
    expect(diffShots(a, b)).toEqual([{ field: 'rating', from: undefined, to: 4 }])
  })
})
