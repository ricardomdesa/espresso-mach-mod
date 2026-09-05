import React, { useEffect, useState } from 'react'

interface NumberFieldProps {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
  className?: string
  ariaLabel?: string
}

/**
 * Campo numérico com buffer de texto próprio. Ao contrário de um
 * `<input type="number" value={x || 0}>`, deixa o campo ficar vazio enquanto
 * o usuário edita — sem o "0" à esquerda preso que aparecia ao apagar tudo e
 * digitar por cima (ex.: setpoint de temperatura, duração dos passos).
 */
const NumberField: React.FC<NumberFieldProps> = ({
  value,
  onChange,
  min,
  max,
  className,
  ariaLabel,
}) => {
  const [buf, setBuf] = useState(() => (Number.isFinite(value) ? String(value) : ''))

  // Só reescreve o buffer quando o valor externo diverge do que ele representa
  // (troca de perfil, reset). Digitação normal não é sobrescrita.
  useEffect(() => {
    const parsed = parseFloat(buf)
    if (parsed !== value && !(buf === '' && !Number.isFinite(value))) {
      setBuf(Number.isFinite(value) ? String(value) : '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (rawInput: string) => {
    // Teclado pt-BR manda vírgula decimal; trata como ponto.
    const raw = rawInput.replace(',', '.')
    // Aceita só dígitos e um ponto decimal (sem negativos: temperatura/tempo).
    if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
    setBuf(raw)
    const n = parseFloat(raw)
    if (Number.isFinite(n)) onChange(n)
  }

  const normalize = () => {
    // Campo vazio ao perder foco (limpou pra redigitar e saiu antes de
    // terminar): volta pro valor atual em vez de forcar 0 e persistir a
    // perda do que ja estava digitado.
    if (buf === '') {
      setBuf(Number.isFinite(value) ? String(value) : '')
      return
    }
    let n = parseFloat(buf)
    if (!Number.isFinite(n)) n = min ?? 0
    if (min != null && n < min) n = min
    if (max != null && n > max) n = max
    setBuf(String(n))
    onChange(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={buf}
      onChange={(e) => commit(e.target.value)}
      onBlur={normalize}
      className={className}
    />
  )
}

export default NumberField
