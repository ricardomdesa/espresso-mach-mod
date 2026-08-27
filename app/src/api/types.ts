export type MachineState = 'idle' | 'heating' | 'preheating' | 'extracting' | 'error'

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
  /** IP da máquina na rede (LAN em modo STA, 192.168.4.1 em modo AP). Informativo. */
  ip: string
  /** LED de iluminação ligado. Não é persistido: ligado no boot da máquina. */
  led: boolean
  /** Relé da bomba ligado. Não é persistido: desligado no boot da máquina. */
  pump: boolean
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
  /** Duração deste passo, em segundos. */
  seconds: number
  /** Estado do relé da bomba durante o passo. */
  pump: boolean
}

export interface ExtractionProfile {
  id: string
  name: string
  description?: string
  /** Temperatura alvo do perfil; vira o setpoint da máquina ao iniciar a extração. */
  temperature_c: number
  /** Sequência de passos liga/desliga da bomba (ex.: pré-infusão). */
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
