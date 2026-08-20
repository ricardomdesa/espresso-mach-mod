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
  timeout = API_TIMEOUT,
): Promise<T> {
  const url = `${baseUrl}${path}`
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
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

export function createApiClient(baseUrl: string) {
  return {
    getStatus: () => request<MachineStatus>(baseUrl, 'GET', '/api/status'),

    setTempSetpoint: (temp: number) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/setpoint/temp', { temp }),

    setPID: (params: PIDParams) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/pid', params),

    startExtraction: () =>
      request<MachineStatus>(baseUrl, 'POST', '/api/extraction/start'),

    stopExtraction: () =>
      request<MachineStatus>(baseUrl, 'POST', '/api/extraction/stop'),

    getProfiles: () =>
      request<ExtractionProfile[]>(baseUrl, 'GET', '/api/profiles'),

    createProfile: (profile: Omit<ExtractionProfile, 'id'>) =>
      request<ExtractionProfile>(baseUrl, 'POST', '/api/profiles', profile),

    updateProfile: (id: string, profile: Omit<ExtractionProfile, 'id'>) =>
      request<ExtractionProfile>(baseUrl, 'PUT', `/api/profiles/${id}`, profile),

    deleteProfile: (id: string) =>
      request<void>(baseUrl, 'DELETE', `/api/profiles/${id}`),

    setActiveProfile: (id: string) =>
      request<MachineStatus>(baseUrl, 'PUT', '/api/profiles/active', { id }),

    // Responde na hora com o cache da máquina e agenda a próxima varredura;
    // enquanto `scanning` for true vale pedir de novo.
    scanWiFi: () => request<WiFiScanResult>(baseUrl, 'GET', '/api/wifi/scan'),

    provisionWiFi: (ssid: string, password: string) =>
      request<{ ok: boolean }>(baseUrl, 'POST', '/api/wifi/provision', { ssid, password }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
