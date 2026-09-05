import React from 'react'
import { TasteTag } from '../api/types'

const TASTE_LABELS: Record<TasteTag, string> = {
  sour: 'Acido',
  bitter: 'Amargo',
  astringent: 'Adstringente',
  balanced: 'Equilibrado',
  watery: 'Aguado',
  sweet: 'Doce',
  fruity: 'Frutado',
  burnt: 'Queimado',
}

const ALL_TAGS = Object.keys(TASTE_LABELS) as TasteTag[]

interface TasteTagsProps {
  value: TasteTag[]
  onChange: (value: TasteTag[]) => void
}

/** Chips de sabor multi-selecao (RF-12). */
const TasteTags: React.FC<TasteTagsProps> = ({ value, onChange }) => {
  const toggle = (tag: TasteTag) => {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag])
  }

  return (
    <div className="flex flex-wrap gap-2">
      {ALL_TAGS.map((tag) => {
        const active = value.includes(tag)
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              active ? 'bg-mocha text-cream' : 'bg-foam text-muted active:bg-line'
            }`}
          >
            {TASTE_LABELS[tag]}
          </button>
        )
      })}
    </div>
  )
}

export default TasteTags
