import { MachineStatus, PIDParams, ExtractionProfile, WiFiScanResult } from './types'

const API_TIMEOUT = 5000

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  token?: string | null,
  timeout = API_TIMEOUT,
): Promise<T> {
  const url = `${baseUrl}${path}`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
  if (token) headers['X-Auth-Token'] = token
  const options: RequestInit = {
    method,
    headers,
    signal: AbortSignal.timeout(timeout),
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new ApiError(res.status, text)
  }
  // 204 (DELETE) e respostas vazias não têm JSON para parsear.
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export function createApiClient(baseUrl: string, token?: string | null) {
  return {
    getStatus: () => request<MachineStatus>(baseUrl, 'GET', '/api/status'),

    // Prova que o codigo de pareamento vale, sem efeito colateral. Resolve com
    // `true` se a maquina aceitou, `false` no 401. Erro de rede sobe como
    // excecao — quem chama distingue "codigo errado" de "maquina sumiu".
    checkAuth: async (): Promise<boolean> => {
      try {
        await request<void>(baseUrl, 'GET', '/api/auth/check', undefined, token)
        return true
      } catch (err) {
        if (err instanceof ApiError && (err.status === 401 || err.status === 404)) {
          // 404: firmware antigo, sem a rota. Nao da para provar o codigo aqui;
          // trata como nao verificado em vez de bloquear o app.
          return err.status === 404
        }
        throw err
      }
    },

    setTempSetpoint: (temp: number) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/setpoint/temp', { temp }, token),

    // LED de iluminação: mesmo estado que o clique curto do botão alterna na máquina.
    setLed: (on: boolean) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/led', { on }, token),

    // Bomba (relé): acionamento manual. O ciclo de extração também liga/desliga.
    setPump: (on: boolean) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/pump', { on }, token),

    // Modo vaporização: on => PID mira o alvo de vapor; off => máquina devolve o
    // setpoint de café para 70 °C. `temp` opcional ajusta o alvo de vapor
    // (80-115 °C, não persiste). Recusado (409) durante uma extração.
    setSteam: (on: boolean, temp?: number) =>
      request<MachineStatus>(
        baseUrl,
        'PUT',
        '/api/steam',
        temp != null ? { on, temp } : { on },
        token,
      ),

    setPID: (params: PIDParams) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/pid', params, token),

    startExtraction: () =>
      request<MachineStatus>(baseUrl, 'POST', '/api/extraction/start', undefined, token),

    stopExtraction: () =>
      request<MachineStatus>(baseUrl, 'POST', '/api/extraction/stop', undefined, token),

    getProfiles: () =>
      request<ExtractionProfile[]>(baseUrl, 'GET', '/api/profiles'),

    createProfile: (profile: Omit<ExtractionProfile, 'id'>) =>
      request<ExtractionProfile>(baseUrl, 'POST', '/api/profiles', profile, token),

    updateProfile: (id: string, profile: Omit<ExtractionProfile, 'id'>) =>
      request<ExtractionProfile>(baseUrl, 'PUT', `/api/profiles/${id}`, profile, token),

    deleteProfile: (id: string) =>
      request<void>(baseUrl, 'DELETE', `/api/profiles/${id}`, undefined, token),

    setActiveProfile: (id: string) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/profiles/active', { id }, token),

    // Responde na hora com o cache da máquina e agenda a próxima varredura;
    // enquanto `scanning` for true vale pedir de novo.
    scanWiFi: () => request<WiFiScanResult>(baseUrl, 'GET', '/api/wifi/scan'),

    // Em modo AP o firmware não exige a chave aqui; em modo STA exige, como
    // qualquer outro endpoint mutante. A chave (código de pareamento) já vai
    // no header quando o app a tem guardada.
    provisionWiFi: (ssid: string, password: string) =>
      request<{ ok: boolean; rebooting: boolean }>(
        baseUrl,
        'POST',
        '/api/wifi/provision',
        { ssid, password },
        token,
      ),

    forgetWifi: () => request<void>(baseUrl, 'POST', '/api/wifi/forget', undefined, token),

    factoryReset: () => request<void>(baseUrl, 'POST', '/api/factory-reset', undefined, token),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
