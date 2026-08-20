import { useEffect, useRef, useState, useCallback } from 'react'
import { WsFrame, WsEvent } from '../api/types'

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

export interface UseWebSocketReturn {
  state: ConnectionState
  lastFrame: WsFrame | null
  lastEvent: WsEvent | null
  lastError: string | null
  send: (data: string) => void
}

const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const [state, setState] = useState<ConnectionState>('closed')
  const [lastFrame, setLastFrame] = useState<WsFrame | null>(null)
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const sendRef = useRef<(data: string) => void>(() => {})

  useEffect(() => {
    if (!url) {
      setState('closed')
      return
    }

    // Cada montagem/URL tem sua própria geração. Callbacks de um socket antigo
    // (que ainda dispara `onclose` depois do cleanup) não podem mexer no estado
    // nem reagendar reconexão para a URL anterior.
    let alive = true
    let attempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    setLastError(null)

    const open = () => {
      if (!alive) return
      setState('connecting')

      let ws: WebSocket
      try {
        // Pode lançar de forma síncrona: URL malformada, ou `ws://` a partir de
        // uma origem segura (bloqueio de conteúdo misto da WebView).
        ws = new WebSocket(url)
      } catch (err) {
        setState('error')
        setLastError(err instanceof Error ? err.message : String(err))
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (!alive) {
          ws.close()
          return
        }
        attempts = 0
        setLastError(null)
        setState('open')
      }

      ws.onmessage = (ev) => {
        if (!alive) return
        try {
          const data = JSON.parse(ev.data as string)
          if ('event' in data) {
            setLastEvent(data as WsEvent)
          } else {
            setLastFrame(data as WsFrame)
          }
        } catch {
          // ignora frames malformados
        }
      }

      ws.onerror = () => {
        if (!alive) return
        setState('error')
      }

      ws.onclose = () => {
        if (!alive) return
        wsRef.current = null
        setState('closed')

        if (attempts < MAX_RECONNECT_ATTEMPTS) {
          attempts += 1
          reconnectTimer = setTimeout(open, RECONNECT_INTERVAL_MS)
        } else {
          setLastError('Nao foi possivel conectar apos varias tentativas.')
        }
      }
    }

    sendRef.current = (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
      }
    }

    open()

    return () => {
      alive = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [url])

  const send = useCallback((data: string) => sendRef.current(data), [])

  return { state, lastFrame, lastEvent, lastError, send }
}
