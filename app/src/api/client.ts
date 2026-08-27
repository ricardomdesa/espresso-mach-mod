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

    setTempSetpoint: (temp: number) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/setpoint/temp', { temp }, token),

    // LED de iluminação: mesmo estado que o clique curto do botão alterna na máquina.
    setLed: (on: boolean) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/led', { on }, token),

    // Bomba (relé): acionamento manual. O ciclo de extração também liga/desliga.
    setPump: (on: boolean) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/pump', { on }, token),

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

    // Exceção ao gate de token quando a máquina ainda está em modo AP
    // (não requer token); em modo STA o servidor exige token aqui também.
    provisionWiFi: (ssid: string, password: string) =>
      request<{ ok: boolean; rebooting: boolean; token: string }>(
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
