import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react'
import { Preferences } from '@capacitor/preferences'
import { MachineStatus, WsFrame, WsEvent, ExtractionProfile } from '../api/types'
import { createApiClient, ApiClient } from '../api/client'
import { useWebSocket, ConnectionState } from '../ws/useWebSocket'
import { bindToWifi, unbindFromWifi } from '../native/networkBinder'

const BASE_URL_KEY = 'philco.baseUrl'
const TOKEN_KEY = 'philco.token'

interface MachineState {
  connected: boolean
  baseUrl: string | null
  token: string | null
  status: MachineStatus | null
  currentFrame: WsFrame | null
  lastEvent: WsEvent | null
  profiles: ExtractionProfile[]
}

type MachineAction =
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_BASE_URL'; payload: string | null }
  | { type: 'SET_TOKEN'; payload: string | null }
  | { type: 'SET_STATUS'; payload: MachineStatus }
  | { type: 'SET_FRAME'; payload: WsFrame }
  | { type: 'SET_EVENT'; payload: WsEvent }
  | { type: 'SET_PROFILES'; payload: ExtractionProfile[] }
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

interface MachineContextValue extends MachineState {
  api: ApiClient | null
  /** Estado do streaming ao vivo. Independente de `connected` (que é REST). */
  wsState: ConnectionState
  connect: (baseUrl: string) => Promise<MachineStatus>
  disconnect: () => Promise<void>
  refreshStatus: () => Promise<void>
  refreshProfiles: () => Promise<void>
  /** Guarda o token de autenticação (devolvido por /api/wifi/provision) para as próximas chamadas. */
  setToken: (token: string) => void
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

  const refreshProfiles = useCallback(async () => {
    if (!api) return
    const profiles = await api.getProfiles()
    dispatch({ type: 'SET_PROFILES', payload: profiles })
  }, [api])

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
  const connect = useCallback(async (baseUrl: string) => {
    const normalized = baseUrl.replace(/\/+$/, '')
    // O token persiste entre reconexões (RESET limpa só o estado em memória);
    // recarrega do storage para as chamadas mutantes continuarem autenticadas.
    const { value: token } = await Preferences.get({ key: TOKEN_KEY })
    const status = await createApiClient(normalized, token).getStatus()
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
        if (!cancelled && value) connect(value).catch(() => {})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [connect])

  const value = useMemo(
    () => ({
      ...state,
      api,
      wsState,
      connect,
      disconnect,
      refreshStatus,
      refreshProfiles,
      setToken,
    }),
    [state, api, wsState, connect, disconnect, refreshStatus, refreshProfiles, setToken],
  )

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>
}

export function useMachine(): MachineContextValue {
  const ctx = useContext(MachineContext)
  if (!ctx) throw new Error('useMachine must be used inside MachineProvider')
  return ctx
}
