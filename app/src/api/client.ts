import { MachineStatus, PIDParams, ExtractionProfile } from './types'

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
): Promise<T> {
  const url = `${baseUrl}${path}`
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(API_TIMEOUT),
  }
  if (body !== undefined) {
    options.body = JSON.stringify(body)
  }

  const res = await fetch(url, options)
  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error')
    throw new ApiError(res.status, text)
  }
  return res.json() as Promise<T>
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

    provisionWiFi: (ssid: string, password: string) =>
      request<void>(baseUrl, 'POST', '/api/wifi/provision', { ssid, password }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>
