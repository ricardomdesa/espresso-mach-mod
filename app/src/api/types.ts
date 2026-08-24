export type MachineState = 'idle' | 'heating' | 'extracting' | 'error'

export interface PIDParams {
  kp: number
  ki: number
  kd: number
}

export interface MachineStatus {
  temp: number
  press: number
  tempSetpoint: number
  pressSetpoint: number
  timer: number
  state: MachineState
  profile: string | null
  /** LED de iluminação ligado. Não é persistido: liga no boot da máquina. */
  led: boolean
  uptime: number
  wifiMode: 'ap' | 'sta' | 'offline'
  pid: PIDParams
}

export interface WiFiNetwork {
  ssid: string
  rssi: number
  secure: boolean
}

export interface WiFiScanResult {
  /** Ainda varrendo: vale pedir de novo daqui a pouco. */
  scanning: boolean
  networks: WiFiNetwork[]
}

export interface ProfileStep {
  time_s: number
  pressure_bar: number
}

export interface ExtractionProfile {
  id: string
  name: string
  description?: string
  steps: ProfileStep[]
}

export interface WsFrame {
  t: number
  temp: number
  press: number
  timer: number
  state: MachineState
  profile: string | null
}

export type WsEvent =
  | { event: 'extraction_started' }
  | { event: 'extraction_stopped' }
  | { event: 'error'; msg: string }
  | { event: 'pong' }

export interface ExtractionRecord {
  id: string
  date: string
  duration_s: number
  profileName: string
  tempAvg: number
  pressAvg: number
  notes?: string
}
