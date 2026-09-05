import React from 'react'
import { Link } from 'react-router-dom'
import { ShotRecord } from '../api/types'

/** Resumo do rascunho aberto no dashboard (RF-03): um toque volta ao preparo. */
const DraftChip: React.FC<{ draft: ShotRecord }> = ({ draft }) => {
  const { log } = draft
  const parts = [
    log.doseG != null ? `${log.doseG.toLocaleString('pt-BR')} g` : null,
    log.grindSetting ? `moagem ${log.grindSetting}` : null,
  ].filter((p): p is string => p != null)

  return (
    <Link
      to="/prep"
      className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-mocha/40 bg-mocha/10 px-4 py-3 shadow-card active:bg-mocha/20"
    >
      <span className="text-xs leading-relaxed text-ink">
        <span className="font-semibold">Rascunho aberto.</span>{' '}
        {parts.length > 0 ? parts.join(' · ') : 'sem dados ainda'}
      </span>
      <span className="shrink-0 text-xs font-semibold text-mocha">Editar</span>
    </Link>
  )
}

export default DraftChip
