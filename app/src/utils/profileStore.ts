import { Preferences } from '@capacitor/preferences'
import { ExtractionProfile } from '../api/types'

// Cache local dos perfis. Deixa o app criar/editar/excluir perfis com a
// maquina desligada; quando ela volta, `syncProfiles` empurra o que ficou
// pendente e traz a lista autoritativa de volta.
const PROFILES_KEY = 'philco.profiles.cache'

export type PendingKind = 'create' | 'update' | 'delete'

export interface StoredProfile extends ExtractionProfile {
  /** Marca de sincronizacao pendente; ausente = em dia com a maquina. */
  _pending?: PendingKind
}

/** Perfil criado offline: id provisorio ate a maquina devolver o definitivo. */
export function isLocalId(id: string): boolean {
  return id.startsWith('local-')
}

export function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export async function loadCache(): Promise<StoredProfile[]> {
  const { value } = await Preferences.get({ key: PROFILES_KEY })
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as StoredProfile[]) : []
  } catch {
    return []
  }
}

export async function saveCache(list: StoredProfile[]): Promise<void> {
  await Preferences.set({ key: PROFILES_KEY, value: JSON.stringify(list) })
}

/** Visao publica: esconde os que aguardam exclusao e tira as marcas internas. */
export function visibleProfiles(list: StoredProfile[]): ExtractionProfile[] {
  return list
    .filter((p) => p._pending !== 'delete')
    .map(({ _pending, ...rest }) => rest)
}

/** Mapa id -> tipo de pendencia, para a UI sinalizar "nao sincronizado". */
export function pendingMap(list: StoredProfile[]): Record<string, PendingKind> {
  const out: Record<string, PendingKind> = {}
  for (const p of list) if (p._pending) out[p.id] = p._pending
  return out
}

function strip(p: StoredProfile): Omit<ExtractionProfile, 'id'> {
  const { id: _id, _pending: _pend, ...rest } = p
  return rest
}

export interface SyncDeps {
  getProfiles: () => Promise<ExtractionProfile[]>
  createProfile: (p: Omit<ExtractionProfile, 'id'>) => Promise<ExtractionProfile>
  updateProfile: (id: string, p: Omit<ExtractionProfile, 'id'>) => Promise<ExtractionProfile>
  deleteProfile: (id: string) => Promise<void>
}

/**
 * Empurra as mudancas locais pendentes para a maquina e devolve a lista
 * autoritativa dela. Uma mudanca que falhar continua pendente no cache para
 * a proxima tentativa.
 */
export async function syncProfiles(
  api: SyncDeps,
  cache: StoredProfile[],
): Promise<StoredProfile[]> {
  const failed: StoredProfile[] = []

  for (const p of cache) {
    if (!p._pending) continue
    try {
      if (p._pending === 'delete') {
        if (!isLocalId(p.id)) await api.deleteProfile(p.id)
      } else if (p._pending === 'create' || isLocalId(p.id)) {
        // Criado offline (id provisorio): sempre um POST, mesmo se depois foi editado.
        await api.createProfile(strip(p))
      } else {
        await api.updateProfile(p.id, strip(p))
      }
    } catch {
      failed.push(p)
    }
  }

  let server: ExtractionProfile[]
  try {
    server = await api.getProfiles()
  } catch {
    // Sem rede para confirmar: mantem o cache como esta.
    return cache
  }

  const merged: StoredProfile[] = server.map((s) => ({ ...s }))

  // Reanexa o que nao subiu, para nao perder o trabalho feito offline.
  for (const p of failed) {
    if (p._pending === 'delete') {
      const idx = merged.findIndex((m) => m.id === p.id)
      if (idx >= 0) merged[idx] = { ...merged[idx], _pending: 'delete' }
    } else if (!merged.some((m) => m.id === p.id)) {
      merged.push(p)
    }
  }

  return merged
}
