import { PIDParams, ExtractionProfile } from '../api/types'

export function validatePID(p: Partial<PIDParams>): string | null {
  if (p.kp !== undefined && (p.kp < 0 || !isFinite(p.kp))) return 'Kp invalido'
  if (p.ki !== undefined && (p.ki < 0 || !isFinite(p.ki))) return 'Ki invalido'
  if (p.kd !== undefined && (p.kd < 0 || !isFinite(p.kd))) return 'Kd invalido'
  return null
}

export function validateProfile(p: Partial<ExtractionProfile>): string | null {
  if (!p.name || p.name.trim().length === 0) return 'Nome obrigatorio'
  if (!p.steps || p.steps.length === 0) return 'Perfil precisa de pelo menos 1 step'
  for (let i = 0; i < p.steps.length; i++) {
    const s = p.steps[i]
    if (s.time_s < 0) return `Step ${i + 1}: tempo negativo`
    if (s.pressure_bar < 0 || s.pressure_bar > 12) return `Step ${i + 1}: pressao fora de 0-12 bar`
  }
  // Steps devem estar em ordem crescente de tempo
  for (let i = 1; i < p.steps.length; i++) {
    if (p.steps[i].time_s <= p.steps[i - 1].time_s) {
      return `Step ${i + 1}: tempo deve ser maior que o anterior`
    }
  }
  return null
}
