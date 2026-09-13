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
   * Alvo de temperatura do modo vaporização (°C). Editável (PUT /api/steam
   * {temp}, faixa 80-115); não persiste — volta a 90 no boot da máquina.
   */
  steamSetpoint: number
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

export interface ExtractionSample {
  /** ms desde o inicio da extracao. */
  t: number
  temp: number
  /** Alvo efetivo do PID naquele instante, quando disponivel. */
  target?: number
}

export interface ExtractionRecord {
  id: string
  date: string
  duration_s: number
  profileName: string
  tempAvg: number
  pressAvg: number
  /** Alvo de temperatura vigente no fim da extracao (setpoint do perfil). */
  tempTarget?: number
  /**
   * Curva de temperatura amostrada (~1 ponto/s, no maximo ~120 pontos) para
   * revisao posterior no historico. Ausente em registros antigos.
   */
  samples?: ExtractionSample[]
  /** Anotacoes livres do usuario (moagem, dose, sabor...). Editavel depois. */
  notes?: string
}

// ---------- diário do barista (SDD-008) ----------

export type ShotStatus = 'draft' | 'extracting' | 'pending_review' | 'done'

export type PhotoKind = 'puckLevel' | 'puckTamped' | 'stream' | 'cup' | 'spentPuck'

export type TasteTag =
  | 'sour' | 'bitter' | 'astringent' | 'balanced'
  | 'watery' | 'sweet' | 'fruity' | 'burnt'

export interface ShotPhoto {
  /** Caminho relativo em Directory.Data: shots/<shotId>/<uuid>.jpg */
  path: string
  kind: PhotoKind
  takenAt: string
}

export interface ShotLog {
  status: ShotStatus

  // --- preparo (antes da extração) ---
  beanId?: string
  /** Nome opcional dado pelo usuario; aparece no historico no lugar do padrao. */
  label?: string
  /** Texto: cada moedor tem escala própria (D10). */
  grindSetting?: string
  doseG?: number
  distribution?: 'none' | 'wdt' | 'tap'
  /** Shot que serviu de base; alimenta o diff (RF-16). */
  parentShotId?: string
  /** Derivado da tela de preparo, não digitado (D6). */
  changedFields?: string[]

  // --- avaliação (depois de provar) ---
  yieldG?: number
  firstDropS?: number
  taste?: TasteTag[]
  channeling?: boolean
  /** 1 a 5. */
  rating?: number
  notes?: string
  /** Aparece no topo do preparo seguinte (RF-06). */
  nextChange?: string

  photos?: ShotPhoto[]

  // --- migração ---
  /** `notes` do schema 1, preservado literalmente (RF-23). */
  legacyNotes?: string
}

/** Estende o ExtractionRecord atual; nenhum campo existente muda de tipo. */
export interface ShotRecord extends ExtractionRecord {
  schema: 2
  source: 'machine' | 'manual'
  log: ShotLog
}

/** O que a lista precisa. Nunca contém `samples` nem fotos. */
export interface ShotIndexEntry {
  id: string
  date: string
  status: ShotStatus
  profileName: string
  duration_s: number
  beanId?: string
  label?: string
  grindSetting?: string
  doseG?: number
  yieldG?: number
  rating?: number
  hasCurve: boolean
  thumbPath?: string
}

// ---------- grão ----------

export interface Bean {
  id: string
  name: string
  roaster?: string
  origin?: string
  process?: string
  roastLevel?: 'light' | 'medium' | 'dark'
  /** ISO date; base do cálculo de dias de descanso (RF-18). */
  roastDate?: string
  openedDate?: string
  pricePerKg?: number
  photoPath?: string
  notes?: string
  archived: boolean
}
