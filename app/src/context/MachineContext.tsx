import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react'
import { MachineStatus, WsFrame, WsEvent, ExtractionProfile } from '../api/types'
import { createApiClient, ApiClient } from '../api/client'
import { useWebSocket } from '../ws/useWebSocket'

interface MachineState {
  connected: boolean
  baseUrl: string | null
  status: MachineStatus | null
  currentFrame: WsFrame | null
  lastEvent: WsEvent | null
  profiles: ExtractionProfile[]
}

type MachineAction =
  | { type: 'SET_CONNECTED'; payload: boolean }
  | { type: 'SET_BASE_URL'; payload: string | null }
  | { type: 'SET_STATUS'; payload: MachineStatus }
  | { type: 'SET_FRAME'; payload: WsFrame }
  | { type: 'SET_EVENT'; payload: WsEvent }
  | { type: 'SET_PROFILES'; payload: ExtractionProfile[] }

function machineReducer(state: MachineState, action: MachineAction): MachineState {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload }
    case 'SET_BASE_URL':
      return { ...state, baseUrl: action.payload }
    case 'SET_STATUS':
      return { ...state, status: action.payload }
    case 'SET_FRAME':
      return { ...state, currentFrame: action.payload }
    case 'SET_EVENT':
      return { ...state, lastEvent: action.payload }
    case 'SET_PROFILES':
      return { ...state, profiles: action.payload }
    default:
      return state
  }
}

interface MachineContextValue extends MachineState {
  api: ApiClient | null
  connect: (baseUrl: string) => void
  disconnect: () => void
  refreshStatus: () => Promise<void>
  refreshProfiles: () => Promise<void>
}

const MachineContext = createContext<MachineContextValue | null>(null)

const initialState: MachineState = {
  connected: false,
  baseUrl: null,
  status: null,
  currentFrame: null,
  lastEvent: null,
  profiles: [],
}

export const MachineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(machineReducer, initialState)

  const wsUrl = useMemo(() => {
    if (!state.baseUrl) return null
    try {
      return `ws://${new URL(state.baseUrl).host}/ws`
    } catch {
      return null
    }
  }, [state.baseUrl])
  const { state: wsState, lastFrame, lastEvent } = useWebSocket(wsUrl)

  const api = useMemo(() => {
    return state.baseUrl ? createApiClient(state.baseUrl) : null
  }, [state.baseUrl])

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
    const isOpen = wsState === 'open'
    if (isOpen !== state.connected) {
      dispatch({ type: 'SET_CONNECTED', payload: isOpen })
    }
    if (isOpen) {
      refreshStatus().catch(() => {})
    }
  }, [wsState, state.connected, refreshStatus])

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

  const connect = useCallback((baseUrl: string) => {
    dispatch({ type: 'SET_BASE_URL', payload: baseUrl })
  }, [])

  const disconnect = useCallback(() => {
    dispatch({ type: 'SET_BASE_URL', payload: null })
    dispatch({ type: 'SET_CONNECTED', payload: false })
  }, [])

  const value = useMemo(
    () => ({
      ...state,
      api,
      connect,
      disconnect,
      refreshStatus,
      refreshProfiles,
    }),
    [state, api, connect, disconnect, refreshStatus, refreshProfiles],
  )

  return <MachineContext.Provider value={value}>{children}</MachineContext.Provider>
}

export function useMachine(): MachineContextValue {
  const ctx = useContext(MachineContext)
  if (!ctx) throw new Error('useMachine must be used inside MachineProvider')
  return ctx
}
