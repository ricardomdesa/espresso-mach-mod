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

// Backoff exponencial com teto. Nunca desiste: o celular pode ficar horas
// bloqueado/fora da rede da maquina e o app tem que voltar sozinho quando ela
// reaparecer. Desistir aqui deixava o socket morto ate o app ser morto na mao.
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30000

// A maquina transmite a cada WS_STREAM_INTERVAL_MS (100ms). Sem nenhum frame
// por HEARTBEAT_TIMEOUT_MS o socket esta half-open (tipico depois que o Android
// congela a WebView na tela de bloqueio): o `onclose` nunca chega e a UI ficaria
// mostrando leituras congeladas. Derruba na mao para forcar a reconexao.
const HEARTBEAT_INTERVAL_MS = 5000
const HEARTBEAT_TIMEOUT_MS = 12000

export function useWebSocket(url: string | null): UseWebSocketReturn {
  const [state, setState] = useState<ConnectionState>('closed')
  const [lastFrame, setLastFrame] = useState<WsFrame | null>(null)
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null)
  const [lastError, setLastError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const sendRef = useRef<(data: string) => void>(() => {})
  // Reconexao imediata pedida de fora do efeito (retorno do bloqueio de tela).
  const wakeRef = useRef<() => void>(() => {})

  useEffect(() => {
    if (!url) {
      setState('closed')
      return
    }

    // Cada montagem/URL tem sua propria geracao. Callbacks de um socket antigo
    // (que ainda dispara `onclose` depois do cleanup) nao podem mexer no estado
    // nem reagendar reconexao para a URL anterior.
    let alive = true
    let attempts = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null
    let lastRxMs = 0

    setLastError(null)

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer)
        heartbeatTimer = null
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimer) return
      const delay = Math.min(RECONNECT_MIN_MS * 2 ** attempts, RECONNECT_MAX_MS)
      attempts += 1
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null
        open()
      }, delay)
    }

    const open = () => {
      if (!alive) return
      setState('connecting')

      let ws: WebSocket
      try {
        // Pode lancar de forma sincrona: URL malformada, ou `ws://` a partir de
        // uma origem segura (bloqueio de conteudo misto da WebView).
        ws = new WebSocket(url)
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err))
        setState('error')
        scheduleReconnect()
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (!alive) {
          ws.close()
          return
        }
        attempts = 0
        lastRxMs = Date.now()
        setLastError(null)
        setState('open')

        stopHeartbeat()
        heartbeatTimer = setInterval(() => {
          if (!alive || wsRef.current !== ws) return
          if (Date.now() - lastRxMs > HEARTBEAT_TIMEOUT_MS) {
            // Socket mudo: derruba para cair no fluxo normal de reconexao.
            stopHeartbeat()
            ws.close()
            return
          }
          if (ws.readyState === WebSocket.OPEN) ws.send('ping')
        }, HEARTBEAT_INTERVAL_MS)
      }

      ws.onmessage = (ev) => {
        if (!alive) return
        lastRxMs = Date.now()
        try {
          const data = JSON.parse(ev.data as string)
          if ('event' in data) {
            // `pong` so serve de keepalive: nao e um evento da maquina.
            if (data.event === 'pong') return
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
        stopHeartbeat()
        wsRef.current = null
        setState('closed')
        scheduleReconnect()
      }
    }

    sendRef.current = (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data)
      }
    }

    // Chamado quando o app volta ao primeiro plano. O Android congela os timers
    // da WebView na tela de bloqueio, entao o backoff que estava pendente pode
    // demorar (ou ter sido agendado contra uma Wi-Fi que ainda nem reassociou).
    // Zera o backoff e tenta na hora.
    wakeRef.current = () => {
      if (!alive) return
      attempts = 0
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      const ws = wsRef.current
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        // Um socket "aberto" que ficou mudo enquanto a tela estava bloqueada e
        // zumbi: derruba e deixa o `onclose` reconectar.
        if (ws.readyState === WebSocket.OPEN && Date.now() - lastRxMs <= HEARTBEAT_TIMEOUT_MS) return
        stopHeartbeat()
        ws.close()
        return
      }
      open()
    }

    open()

    return () => {
      alive = false
      wakeRef.current = () => {}
      if (reconnectTimer) clearTimeout(reconnectTimer)
      stopHeartbeat()
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [url])

  // A WebView do Capacitor dispara `visibilitychange` no pause/resume da
  // Activity; `focus`/`online` cobrem o caso do WebView que so volta a rodar
  // depois que a Wi-Fi reassocia.
  useEffect(() => {
    const wake = () => wakeRef.current()
    const onVisible = () => {
      if (document.visibilityState === 'visible') wake()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', wake)
      window.removeEventListener('online', wake)
    }
  }, [])

  const send = useCallback((data: string) => sendRef.current(data), [])

  return { state, lastFrame, lastEvent, lastError, send }
}
