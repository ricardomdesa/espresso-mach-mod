export type MachineState =
  | 'idle'
  | 'heating'
  | 'preheating'
  | 'steaming'
  | 'extracting'
  | 'error'

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
  /**
   * Modo vaporização ligado: o PID mira ~90 °C em vez do setpoint de café.
   * Não é persistido (desligado no boot); ao desligar, a máquina devolve o
   * setpoint de café para 70 °C.
   */
  steam: boolean
  /**
   * Relé "temperatura pronta" (GPIO1) fechado: caldeira no alvo, com histerese.
   * Para extração manual sem o app.
   */
  ready: boolean
  /** Debug da malha: duty do PID 0..100 %. */
  duty: number
  /** Debug da malha: alvo efetivo do PID (setpoint de cafe ou ~90 em vapor). */
  target: number
  /** Debug: ms desde a ultima leitura valida do termopar (grande = falha). */
  sensAgeMs: number
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
  /** Debug da malha: duty do PID 0..100 %. */
  duty?: number
  /** Debug da malha: alvo efetivo do PID. */
  target?: number
  /** Debug: ms desde a ultima leitura valida do termopar. */
  sensAgeMs?: number
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
