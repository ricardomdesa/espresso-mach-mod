import React from 'react'
import { formatTimer } from '../utils/formatters'

interface TimerDisplayProps {
  seconds: number
  large?: boolean
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({ seconds, large = false }) => {
  return (
    <div
      className={`tabular-live font-semibold text-ink ${large ? 'text-6xl' : 'text-2xl'}`}
    >
      {formatTimer(seconds)}
    </div>
  )
}

export default TimerDisplay
