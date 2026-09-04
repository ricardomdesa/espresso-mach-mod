import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExtractionRecord, ShotIndexEntry } from '../api/types'

// `Preferences` mockado por um Map em memoria — nenhum teste toca o
// dispositivo (SDD-008 §7).
const store = new Map<string, string>()

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      store.set(key, value)
    },
    remove: async ({ key }: { key: string }) => {
      store.delete(key)
    },
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    rmdir: async () => {},
    readdir: async () => ({ files: [] }),
    writeFile: async () => {},
    readFile: async () => ({ data: '' }),
    deleteFile: async () => {},
  },
}))

const {
  migrate,
  getIndex,
  getShot,
  saveShot,
  removeShot,
  getDraft,
  openDraft,
  discardDraft,
  bindExtraction,
} = await import('./shotRepository')

function legacyRecord(id: string, date: string, notes?: string): ExtractionRecord {
  return { id, date, duration_s: 25, profileName: 'Padrao', tempAvg: 92, pressAvg: 9, notes }
}

beforeEach(() => {
  store.clear()
})

describe('migrate', () => {
  it('converte N registros do schema 1 em N shards + indice', async () => {
    const legacy = [
      legacyRecord('a', '2026-01-01T00:00:00.000Z', 'moagem 7'),
      legacyRecord('b', '2026-01-02T00:00:00.000Z'),
    ]
    store.set('philco_extraction_history', JSON.stringify(legacy))

    const result = await migrate()

    expect(result.migrated).toBe(2)
    const index = await getIndex()
    expect(index).toHaveLength(2)
    const a = await getShot('a')
    expect(a?.schema).toBe(2)
    expect(a?.log.status).toBe('done')
    expect(a?.log.legacyNotes).toBe('moagem 7')
  })

  it('roda duas vezes sem duplicar', async () => {
    store.set(
      'philco_extraction_history',
      JSON.stringify([legacyRecord('a', '2026-01-01T00:00:00.000Z')]),
    )
    await migrate()
    await migrate()
    expect(await getIndex()).toHaveLength(1)
  })

  it('mantem a chave antiga intacta', async () => {
    const legacy = [legacyRecord('a', '2026-01-01T00:00:00.000Z', 'nota original')]
    store.set('philco_extraction_history', JSON.stringify(legacy))
    await migrate()
    expect(store.get('philco_extraction_history')).toBe(JSON.stringify(legacy))
  })

  it('store vazio: marca schema 2 sem criar nada', async () => {
    const result = await migrate()
    expect(result.migrated).toBe(0)
    expect(await getIndex()).toEqual([])
    expect(store.get('philco.schema')).toBe('2')
  })
})

describe('indice', () => {
  it('saveShot reindexa', async () => {
    await saveShot({
      id: 's1',
      date: '2026-01-01T00:00:00.000Z',
      duration_s: 30,
      profileName: 'P',
      tempAvg: 93,
      pressAvg: 9,
      schema: 2,
      source: 'manual',
      log: { status: 'done', doseG: 18 },
    })
    const index = await getIndex()
    expect(index).toHaveLength(1)
    expect(index[0].doseG).toBe(18)
  })

  it('removeShot some do indice', async () => {
    await saveShot({
      id: 's1',
      date: '2026-01-01T00:00:00.000Z',
      duration_s: 30,
      profileName: 'P',
      tempAvg: 93,
      pressAvg: 9,
      schema: 2,
      source: 'manual',
      log: { status: 'done' },
    })
    await removeShot('s1')
    expect(await getIndex()).toEqual([])
    expect(await getShot('s1')).toBeNull()
  })

  it('ordena por data desc', async () => {
    const base = {
      duration_s: 30,
      profileName: 'P',
      tempAvg: 93,
      pressAvg: 9,
      schema: 2 as const,
      source: 'manual' as const,
      log: { status: 'done' as const },
    }
    await saveShot({ ...base, id: 'old', date: '2026-01-01T00:00:00.000Z' })
    await saveShot({ ...base, id: 'new', date: '2026-02-01T00:00:00.000Z' })
    const index = await getIndex()
    expect(index.map((e: ShotIndexEntry) => e.id)).toEqual(['new', 'old'])
  })
})

describe('rascunho', () => {
  it('openDraft recusa criar um segundo rascunho', async () => {
    await openDraft({ beanId: 'bean1' })
    await expect(openDraft({ beanId: 'bean2' })).rejects.toThrow()
  })

  it('discardDraft limpa a chave de rascunho', async () => {
    await openDraft({ beanId: 'bean1' })
    await discardDraft()
    expect(await getDraft()).toBeNull()
  })

  it('bindExtraction com rascunho aberto anexa a extracao a ele', async () => {
    const draft = await openDraft({ beanId: 'bean1', doseG: 18 })
    const shot = await bindExtraction({
      duration_s: 28,
      profileName: 'Padrao',
      tempAvg: 93,
      pressAvg: 9,
      samples: [{ t: 0, temp: 93 }],
    })

    expect(shot.id).toBe(draft.id)
    expect(shot.log.status).toBe('pending_review')
    expect(shot.log.doseG).toBe(18)
    expect(shot.duration_s).toBe(28)
    expect(await getDraft()).toBeNull()
  })

  it('bindExtraction sem rascunho aberto cria um registro novo em pending_review', async () => {
    const shot = await bindExtraction({
      duration_s: 28,
      profileName: 'Padrao',
      tempAvg: 93,
      pressAvg: 9,
    })
    expect(shot.log.status).toBe('pending_review')
    expect(shot.source).toBe('machine')
    expect(await getShot(shot.id)).not.toBeNull()
  })
})
