import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShotIndexEntry } from '../api/types'
import { ratio } from '../utils/derived'
import { useFormatters } from '../utils/formatters'
import { readPhotoDataUrl } from '../utils/photoStore'

const STATUS_LABEL: Record<ShotIndexEntry['status'], string> = {
  draft: 'Rascunho',
  extracting: 'Extraindo',
  pending_review: 'Avaliar',
  done: 'Concluido',
}

const STATUS_STYLE: Record<ShotIndexEntry['status'], string> = {
  draft: 'bg-foam text-muted',
  extracting: 'bg-mocha/10 text-mocha',
  pending_review: 'bg-brick/10 text-brick',
  done: 'bg-herb/10 text-herb',
}

/**
 * Item do historico (RF-20): so o que o indice ja tem, sem curva. A
 * miniatura e a unica coisa que ainda le do disco, e faz isso sozinha,
 * depois do card ja estar na tela — nao atrasa a lista (RNF-01).
 */
const ShotCard: React.FC<{ entry: ShotIndexEntry }> = ({ entry }) => {
  const { timer } = useFormatters()
  const [thumb, setThumb] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (entry.thumbPath) {
      readPhotoDataUrl(entry.thumbPath)
        .then((url) => {
          if (!cancelled) setThumb(url)
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [entry.thumbPath])

  const r = ratio(entry.doseG, entry.yieldG)

  return (
    <Link
      to={`/shots/${entry.id}`}
      className="flex items-center gap-3 rounded-2xl border border-line bg-cream p-3 shadow-card active:bg-foam"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-foam">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[10px] text-muted">sem foto</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-ink">
            {entry.grindSetting ? `Moagem ${entry.grindSetting}` : entry.profileName || 'Shot'}
          </span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLE[entry.status]}`}
          >
            {STATUS_LABEL[entry.status]}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span>
            {entry.doseG != null ? `${entry.doseG}g` : '--'}
            {entry.yieldG != null ? ` → ${entry.yieldG}g` : ''}
          </span>
          {r != null && <span>ratio 1:{r.toFixed(1)}</span>}
          {entry.hasCurve && <span>{timer(entry.duration_s)}</span>}
          {entry.rating != null && <span>nota {entry.rating}/5</span>}
        </div>
        <div className="text-[11px] text-muted">
          {new Date(entry.date).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </Link>
  )
}

export default ShotCard
