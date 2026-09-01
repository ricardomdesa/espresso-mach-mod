import React, { createContext, useContext, useReducer, useCallback, useMemo, useRef } from 'react'
import { Preferences } from '@capacitor/preferences'
import { MachineStatus, WsFrame, WsEvent, ExtractionProfile } from '../api/types'
import { createApiClient, ApiClient } from '../api/client'
import { useWebSocket, ConnectionState } from '../ws/useWebSocket'
import { bindToWifi, unbindFromWifi } from '../native/networkBinder'
import {
  StoredProfile,
  PendingKind,
  loadCache,
  saveCache,
  visibleProfiles,
  pendingMap,
  syncProfiles,
  newLocalId,
} from '../utils/profileStore'

const BASE_URL_KEY = 'philco.baseUrl'
const TOKEN_KEY = 'philco.token'

interface MachineState {
  connected: boolean
  baseUrl: string | null
  token: string | null
  status: MachineStatus | null
  currentFrame: WsFrame | null
  lastEvent: WsEvent | null
  profiles: StoredProfile[]
}

type MachineAction =
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_BASE_URL'; payload: string | null }
  | { type: 'SET_TOKEN'; payload: string | null }
  | { type: 'SET_STATUS'; payload: MachineStatus }
  | { type: 'SET_FRAME'; payload: WsFrame }
  | { type: 'SET_EVENT'; payload: WsEvent }
  | { type: 'SET_PROFILES'; payload: StoredProfile[] }
  | { type: 'RESET' }

function machineReducer(state: MachineState, action: MachineAction): MachineState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload }
    case 'SET_BASE_URL':
      return { ...state, baseUrl: action.payload }
    case 'SET_TOKEN':
      return { ...state, token: action.payload }
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_FRAME':
      return { ...state, currentFrame: action.payload }
    case 'SET_EVENT':
      return { ...state, lastEvent: action.payload }
    case 'SET_PROFILES':
      return { ...state, profiles: action.payload }
    case 'RESET':
      return initialState
    default:
      return state
  }
}

interface MachineContextValue extends Omit<MachineState, 'profiles'> {
  api: ApiClient | null
  /** Estado do streaming ao vivo. Independente de `connected` (que é REST). */
  wsState: ConnectionState
  /** Perfis visíveis (esconde os que aguardam exclusão). Funciona offline via cache. */
  profiles: ExtractionProfile[]
  /** id do perfil -> tipo de mudança ainda não enviada à máquina. */
  profilesPending: Record<string, PendingKind>
  /** `apiKey` (código de pareamento): quando passado, é gravado e usado nas
   *  chamadas mutantes; senão reusa o que já estiver guardado no aparelho. */
  connect: (baseUrl: string, apiKey?: string) => Promise<MachineStatus>
  disconnect: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshProfiles: () => Promise<void>
  /** Cria (sem id) ou edita (com id) um perfil. Grava local e sincroniza se online. */
  saveProfile: (profile: Omit<ExtractionProfile, 'id'>, id?: string) => Promise<void>
  /** Remove um perfil. Local se offline; sincroniza ao reconectar. */
  removeProfile: (id: string) => Promise<void>
  /** Guarda o código de pareamento (chave fixa da máquina) para as próximas chamadas. */
  setToken: (token: string) => void
  /** Há um código de pareamento válido: os comandos que mudam estado funcionam.
   *  Sem ele o app é somente-leitura — a máquina devolve 401 nas rotas mutantes. */
  canCommand: boolean
}

const MachineContext = createContext<MachineContextValue | null>(null)

const initialState: MachineState = {
  connected: false,
  baseUrl: null,
  token: null,
  status: null,
  currentFrame: null,
  lastEvent: null,
  profiles: [],
}

export const MachineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(machineReducer, initialState)

  // O WebSocket só sobe depois que o REST confirmou a máquina. Assim uma
  // máquina que ainda não implementa /ws não impede o app de funcionar.
  const wsUrl = useMemo(() => {
    if (!state.baseUrl || !state.connected) return null
    try {
      return `ws://${new URL(state.baseUrl).host}/ws`
    } catch {
      return null
    }
  }, [state.baseUrl, state.connected])
  const { state: wsState, lastFrame, lastEvent } = useWebSocket(wsUrl)

  const api = useMemo(() => {
    return state.baseUrl ? createApiClient(state.baseUrl, state.token) : null
  }, [state.baseUrl, state.token])

  const refreshStatus = useCallback(async () => {
    if (!api) return
    const status = await api.getStatus()
    dispatch({ type: 'SET_STATUS', payload: status })
  }, [api])

  // Uma sincronização por vez: evita que dois refresh concorrentes (efeito de
  // conexão + mount de tela) reenviem a mesma criação pendente e dupliquem o
  // perfil na máquina.
  const syncingRef = useRef(false)
  const runSync = useCallback(
    async (cache: StoredProfile[]) => {
      if (!api || syncingRef.current) return
      syncingRef.current = true
      try {
        const synced = await syncProfiles(api, cache)
        await saveCache(synced)
        dispatch({ type: 'SET_PROFILES', payload: synced })
      } finally {
        syncingRef.current = false
      }
    },
    [api],
  )

  // Offline: mostra o cache local. Online: empurra as pendências e recarrega
  // a lista autoritativa da máquina.
  const refreshProfiles = useCallback(async () => {
    const cache = await loadCache()
    dispatch({ type: 'SET_PROFILES', payload: cache })
    await runSync(cache)
  }, [runSync])

  const saveProfile = useCallback(
    async (profile: Omit<ExtractionProfile, 'id'>, id?: string) => {
      const cache = await loadCache()
      let next: StoredProfile[]
      if (id && cache.some((p) => p.id === id)) {
        next = cache.map((p) =>
          p.id === id
            ? {
                ...profile,
                id,
                // Perfil ainda não criado na máquina continua como 'create'.
                _pending: (p._pending === 'create' ? 'create' : 'update') as PendingKind,
              }
            : p,
        )
      } else if (id) {
        // Edição de um perfil que só existia no servidor (cache ainda não o tinha).
        next = [...cache, { ...profile, id, _pending: 'update' as PendingKind }]
      } else {
        next = [...cache, { ...profile, id: newLocalId(), _pending: 'create' as PendingKind }]
      }
      await saveCache(next)
      dispatch({ type: 'SET_PROFILES', payload: next })
      await runSync(next)
    },
    [runSync],
  )

  const removeProfile = useCallback(
    async (id: string) => {
      const cache = await loadCache()
      const entry = cache.find((p) => p.id === id)
      const next: StoredProfile[] =
        !entry || entry._pending === 'create'
          ? // Nunca chegou na máquina: só some do cache.
            cache.filter((p) => p.id !== id)
          : cache.map((p) =>
              p.id === id ? { ...p, _pending: 'delete' as PendingKind } : p,
            )
      await saveCache(next)
      dispatch({ type: 'SET_PROFILES', payload: next })
      await runSync(next)
    },
    [runSync],
  )

  React.useEffect(() => {
    if (lastFrame) {
      dispatch({ type: 'SET_FRAME', payload: lastFrame })
    }
  }, [lastFrame])

  React.useEffect(() => {
    if (lastEvent) {
      dispatch({ type: 'SET_EVENT', payload: lastEvent })
    }
  }, [lastEvent])

  // Conecta = provar que a máquina responde ao REST. Só então marcamos
  // `connected` e liberamos as rotas; erro sobe para quem chamou mostrar.
  const connect = useCallback(async (baseUrl: string, apiKey?: string) => {
    const normalized = baseUrl.replace(/\/+$/, '')
    // Código de pareamento novo (digitado no Setup) ou o que já está guardado —
    // ele persiste entre reconexões (RESET limpa só o estado em memória) e
    // mantém as chamadas mutantes autenticadas.
    const typed = apiKey?.trim() || null
    let token = typed ?? (await Preferences.get({ key: TOKEN_KEY })).value

    const status = await createApiClient(normalized, token).getStatus()

    // /api/status é público: responde 200 mesmo sem código. Sem esta checagem
    // o app entrava no painel achando que estava pareado e só descobria o
    // problema no primeiro comando, com um 401 solto na cara do usuário.
    if (token) {
      const valid = await createApiClient(normalized, token).checkAuth()
      if (!valid) {
        if (typed) {
          // Digitado agora: não grava nada e deixa o Setup explicar.
          throw new Error('Codigo de pareamento invalido para esta maquina.')
        }
        // Guardado de um pareamento antigo (a máquina trocou de código).
        // Segue conectado em modo leitura em vez de travar o app.
        token = null
        await Preferences.remove({ key: TOKEN_KEY })
      } else if (typed) {
        await Preferences.set({ key: TOKEN_KEY, value: typed })
      }
    }

    dispatch({ type: 'SET_BASE_URL', payload: normalized })
    dispatch({ type: 'SET_TOKEN', payload: token ?? null })
    dispatch({ type: 'SET_STATUS', payload: status })
    dispatch({ type: 'SET_CONNECTED', payload: true })
    Preferences.set({ key: BASE_URL_KEY, value: normalized }).catch(() => {})
    return status
  }, [])

  const setToken = useCallback((token: string) => {
    dispatch({ type: 'SET_TOKEN', payload: token })
    Preferences.set({ key: TOKEN_KEY, value: token }).catch(() => {})
  }, [])

  // Limpa todo o estado da máquina (senão a UI mostra leituras/perfis
  // congelados da conexão anterior) e libera o app da Wi-Fi anterior — do
  // contrário ele fica preso à rede (ex.: o AP morto do Philco-Setup) e as
  // próximas requisições nunca saem para a rede certa.
  const disconnect = useCallback(async () => {
    dispatch({ type: 'RESET' })
    Preferences.remove({ key: BASE_URL_KEY }).catch(() => {})
    await unbindFromWifi()
  }, [])

  // Prende o app à Wi-Fi antes de qualquer requisição e reconecta sozinho no
  // último endereço conhecido.
  React.useEffect(() => {
    let cancelled = false
    bindToWifi()
      .then(() => Preferences.get({ key: BASE_URL_KEY }))
      .then(({ value }) => {
        if (cancelled || !value) return
        // Registra o endereço conhecido já aqui: libera as rotas que funcionam
        // offline (dashboard/ajustes) mesmo que o connect abaixo falhe porque
        // a máquina está desligada.
        dispatch({ type: 'SET_BASE_URL', payload: value })
        connect(value).catch(() => {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [connect])

  // O Android congela a WebView e pode derrubar a Wi-Fi enquanto a tela está
  // bloqueada. Ao voltar, o processo pode ter perdido o bind (`onLost` do
  // NetworkBinder zera a rota) e o REST pode estar apontando para uma conexão
  // morta. Refaz o bind e revalida a máquina — o WebSocket se reconecta sozinho
  // pelo próprio `wake` do useWebSocket.
  const baseUrlRef = useRef(state.baseUrl)
  baseUrlRef.current = state.baseUrl

  React.useEffect(() => {
    let resuming = false
    const resume = () => {
      if (resuming) return
      resuming = true
      bindToWifi()
        .then(() => {
          const baseUrl = baseUrlRef.current
          if (!baseUrl) return
          return connect(baseUrl).then(() => undefined)
        })
        .catch(() => {})
        .finally(() => {
          resuming = false
        })
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') resume()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', resume)
    window.addEventListener('online', resume)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', resume)
      window.removeEventListener('online', resume)
    }
  }, [connect])

  // Carrega o cache local de perfis no boot e sincroniza assim que a máquina responder.
  React.useEffect(() => {
    refreshProfiles().catch(() => {})
  }, [refreshProfiles])

  const profilesView = useMemo(() => visibleProfiles(state.profiles), [state.profiles])
  const profilesPending = useMemo(() => pendingMap(state.profiles), [state.profiles])

  const value = useMemo(
    () => ({
      ...state,
      profiles: profilesView,
      profilesPending,
      api,
      wsState,
      connect,
      disconnect,
      refreshStatus,
      refreshProfiles,
      saveProfile,
      removeProfile,
      setToken,
      canCommand: !!state.token,
    }),
    [
      state,
      profilesView,
      profilesPending,
      api,
      wsState,
      connect,
      disconnect,
      refreshStatus,
      refreshProfiles,
      saveProfile,
      removeProfile,
      setToken,
    ],
  )

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>
}

export function useMachine(): MachineContextValue {
  const ctx = useContext(MachineContext)
  if (!ctx) throw new Error('useMachine must be used inside MachineProvider')
  return ctx
}
