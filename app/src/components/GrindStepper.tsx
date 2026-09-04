import React from 'react'

interface GrindStepperProps {
  value: string
  /** Moagem do ultimo shot concluido, so como referencia visual. */
  previous?: string
  onChange: (value: string) => void
}

const STEP = 1

/**
 * Moagem e texto, nao numero (D10): cada moedor tem escala propria e pode
 * trocar. O stepper +/- so aparece quando o valor atual e numerico; caso
 * contrario o campo se comporta como texto livre ("12 cliques").
 */
const GrindStepper: React.FC<GrindStepperProps> = ({ value, previous, onChange }) => {
  const numeric = value.trim() !== '' && Number.isFinite(Number(value))

  const bump = (delta: number) => {
    const n = Number(value)
    const next = (Number.isFinite(n) ? n : 0) + delta
    onChange(String(Math.round(next * 10) / 10))
  }

  return (
    <div>
      {previous && (
        <div className="mb-1.5 text-xs text-muted">
          ultima vez: <span className="font-medium text-ink">{previous}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        {numeric && (
          <button
            type="button"
            onClick={() => bump(-STEP)}
            aria-label="Moagem mais fina"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-cream text-lg font-bold text-ink active:bg-foam"
          >
            −
          </button>
        )}
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Ex: 7 ou 12 cliques"
          className="w-full rounded-xl border border-line bg-cream px-3 py-2.5 text-center text-sm text-ink outline-none placeholder:text-muted/70 focus:border-mocha"
        />
        {numeric && (
          <button
            type="button"
            onClick={() => bump(STEP)}
            aria-label="Moagem mais grossa"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-cream text-lg font-bold text-ink active:bg-foam"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

export default GrindStepper
