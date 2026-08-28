import { PIDParams, ExtractionProfile } from '../api/types'

export function validatePID(p: Partial<PIDParams>): string | null {
  if (p.kp !== undefined && (p.kp < 0 || !isFinite(p.kp))) return 'Kp invalido'
  if (p.ki !== undefined && (p.ki < 0 || !isFinite(p.ki))) return 'Ki invalido'
  if (p.kd !== undefined && (p.kd < 0 || !isFinite(p.kd))) return 'Kd invalido'
  return null
}

export const PROFILE_TEMP_MIN = 20
// Teto de segurança do firmware (TEMP_MAX_SAFETY_C): acima disto o PID força
// duty 0 %, então um perfil não pode pedir mais que isso.
export const PROFILE_TEMP_MAX = 115
export const PROFILE_STEP_MAX_S = 600

export function validateProfile(p: Partial<ExtractionProfile>): string | null {
  if (!p.name || p.name.trim().length === 0) return 'Nome obrigatorio'
  if (
    p.temperature_c === undefined ||
    !isFinite(p.temperature_c) ||
    p.temperature_c < PROFILE_TEMP_MIN ||
    p.temperature_c > PROFILE_TEMP_MAX
  ) {
    return `Temperatura fora de ${PROFILE_TEMP_MIN}-${PROFILE_TEMP_MAX} °C`
  }
  if (!p.steps || p.steps.length === 0) return 'Perfil precisa de pelo menos 1 passo'
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i]
    if (!isFinite(s.seconds) || s.seconds <= 0) return `Passo ${i + 1}: duracao deve ser maior que 0 s`
    if (s.seconds > PROFILE_STEP_MAX_S) return `Passo ${i + 1}: duracao acima de ${PROFILE_STEP_MAX_S} s`
    if (typeof s.pump !== 'boolean') return `Passo ${i + 1}: estado da bomba invalido`
  }
  return null
}
