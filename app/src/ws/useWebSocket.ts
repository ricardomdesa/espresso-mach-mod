import { useEffect, useRef, useState, useCallback } from 'react'
import { WsFrame, WsEvent } from '../api/types'

export type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

export interface UseWebSocketReturn {
  state: ConnectionState
  lastFrame: WsFrame | null
  lastEvent: WsEvent | null
  send: (data: string) => void
}

const RECONNECT_INTERVAL_MS = 3000
const MAX_RECONNECT_ATTEMPTS = 10

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const [state, setState] = useState<ConnectionState>('closed')
  const [lastFrame, setLastFrame] = useState<WsFrame | null>(null)
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)
  const isMountedRef = useRef(true)

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const connect = useCallback(() => {
    if (!url || !isMountedRef.current) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setState('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      if (!isMountedRef.current) {
        ws.close()
        return
      }
      attemptsRef.current = 0
      setState('open')
    }

    ws.onmessage = (ev) => {
      if (!isMountedRef.current) return
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
      if (!isMountedRef.current) return
      setState('error')
    }

    ws.onclose = () => {
      if (!isMountedRef.current) return
      wsRef.current = null
      setState('closed')

      if (attemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
        attemptsRef.current += 1
        reconnectTimerRef.current = setTimeout(() => {
          connect()
        }, RECONNECT_INTERVAL_MS)
      }
    }
  }, [url, clearReconnectTimer])

  useEffect(() => {
    isMountedRef.current = true
    if (url) {
      connect()
    }
    return () => {
      isMountedRef.current = false
      clearReconnectTimer()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [url, connect, clearReconnectTimer])

  const send = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data)
    }
  }, [])

  return { state, lastFrame, lastEvent, send }
}
