import { Preferences } from '@capacitor/preferences'
import { ExtractionRecord, ShotIndexEntry, ShotLog, ShotRecord } from '../api/types'
import { removeShotPhotos } from './photoStore'

// Storage particionado (SDD-008 D5): um indice leve para a lista + um shard
// por shot para o registro completo (curva, fotos). Evita carregar tudo que
// `philco_extraction_history` carregava so pra desenhar a lista.
const INDEX_KEY = 'philco.shots.index'
const SHOT_KEY = (id: string) => `philco.shot.${id}`
const DRAFT_KEY = 'philco.shots.draft'
const SCHEMA_KEY = 'philco.schema'
const LEGACY_HISTORY_KEY = 'philco_extraction_history'

/** Dados que a extracao real produz, antes de virar (ou completar) um ShotRecord. */
export type MachineShotData = Pick<
  ExtractionRecord,
  'duration_s' | 'profileName' | 'tempAvg' | 'pressAvg' | 'tempTarget' | 'samples'
>

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

async function readJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key })
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

function toIndexEntry(shot: ShotRecord): ShotIndexEntry {
  const photos = shot.log.photos ?? []
  const thumb = photos.find((p) => p.kind === 'cup') ?? photos[0]
  return {
    id: shot.id,
    date: shot.date,
    status: shot.log.status,
    profileName: shot.profileName,
    duration_s: shot.duration_s,
    beanId: shot.log.beanId,
    grindSetting: shot.log.grindSetting,
    doseG: shot.log.doseG,
    yieldG: shot.log.yieldG,
    rating: shot.log.rating,
    hasCurve: !!(shot.samples && shot.samples.length > 0),
    thumbPath: thumb?.path,
  }
}

async function writeIndex(index: ShotIndexEntry[]): Promise<void> {
  const sorted = [...index].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  await Preferences.set({ key: INDEX_KEY, value: JSON.stringify(sorted) })
}

async function reindex(shot: ShotRecord): Promise<void> {
  const index = (await readJson<ShotIndexEntry[]>(INDEX_KEY)) ?? []
  const entry = toIndexEntry(shot)
  const pos = index.findIndex((e) => e.id === shot.id)
  if (pos >= 0) index[pos] = entry
  else index.push(entry)
  await writeIndex(index)
}

/** Migracao schema 1 -> 2 (RF-23/RF-24). Idempotente: seguro rodar toda abertura do app. */
export async function migrate(): Promise<{ migrated: number }> {
  const { value: schema } = await Preferences.get({ key: SCHEMA_KEY })
  if (schema === '2') return { migrated: 0 }

  const legacy = (await readJson<ExtractionRecord[]>(LEGACY_HISTORY_KEY)) ?? []
  if (legacy.length === 0) {
    await Preferences.set({ key: SCHEMA_KEY, value: '2' })
    return { migrated: 0 }
  }

  const index: ShotIndexEntry[] = []
  for (const old of legacy) {
    const log: ShotLog = { status: 'done', legacyNotes: old.notes }
    const shot: ShotRecord = { ...old, schema: 2, source: 'machine', log }
    await Preferences.set({ key: SHOT_KEY(shot.id), value: JSON.stringify(shot) })
    index.push(toIndexEntry(shot))
  }
  await writeIndex(index)
  await Preferences.set({ key: SCHEMA_KEY, value: '2' })
  // philco_extraction_history NAO e apagado (RF-24): backup e rede de seguranca.
  return { migrated: legacy.length }
}

export async function getIndex(): Promise<ShotIndexEntry[]> {
  return (await readJson<ShotIndexEntry[]>(INDEX_KEY)) ?? []
}

export async function getShot(id: string): Promise<ShotRecord | null> {
  return readJson<ShotRecord>(SHOT_KEY(id))
}

export async function saveShot(shot: ShotRecord): Promise<void> {
  await Preferences.set({ key: SHOT_KEY(shot.id), value: JSON.stringify(shot) })
  await reindex(shot)
}

export async function removeShot(id: string): Promise<void> {
  await Preferences.remove({ key: SHOT_KEY(id) })
  const index = (await readJson<ShotIndexEntry[]>(INDEX_KEY)) ?? []
  await writeIndex(index.filter((e) => e.id !== id))
  await removeShotPhotos(id)
}

/** Diario completo em JSON, fotos referenciadas por caminho relativo (RF-22). */
export async function exportAll(): Promise<string> {
  const index = await getIndex()
  const shots = await Promise.all(index.map((e) => getShot(e.id)))
  return JSON.stringify(shots.filter((s): s is ShotRecord => s != null))
}

export async function getDraft(): Promise<ShotRecord | null> {
  const { value: id } = await Preferences.get({ key: DRAFT_KEY })
  if (!id) return null
  return getShot(id)
}

/** No maximo um rascunho aberto por vez (D3). */
export async function openDraft(seed: Partial<ShotLog>): Promise<ShotRecord> {
  const existing = await getDraft()
  if (existing) throw new Error('Ja existe um rascunho aberto')

  const id = newId()
  const shot: ShotRecord = {
    id,
    date: new Date().toISOString(),
    duration_s: 0,
    profileName: '',
    tempAvg: 0,
    pressAvg: 0,
    schema: 2,
    source: 'manual',
    log: { status: 'draft', ...seed },
  }
  await saveShot(shot)
  await Preferences.set({ key: DRAFT_KEY, value: id })
  return shot
}

/** Descarta o rascunho aberto e as fotos que ele ja gravou (RF-07). */
export async function discardDraft(): Promise<void> {
  const { value: id } = await Preferences.get({ key: DRAFT_KEY })
  if (!id) return
  await removeShot(id)
  await Preferences.remove({ key: DRAFT_KEY })
}

/**
 * Unico ponto de juncao entre a maquina e o diario (D2). Com rascunho aberto,
 * anexa os dados a ele; sem rascunho, cria um registro novo em
 * `pending_review` (RF-09) — o comportamento de hoje, preservado.
 */
export async function bindExtraction(machineData: MachineShotData): Promise<ShotRecord> {
  const draft = await getDraft()

  if (draft) {
    const shot: ShotRecord = {
      ...draft,
      ...machineData,
      source: 'machine',
      log: { ...draft.log, status: 'pending_review' },
    }
    await saveShot(shot)
    await Preferences.remove({ key: DRAFT_KEY })
    return shot
  }

  const shot: ShotRecord = {
    id: newId(),
    date: new Date().toISOString(),
    ...machineData,
    schema: 2,
    source: 'machine',
    log: { status: 'pending_review' },
  }
  await saveShot(shot)
  return shot
}
