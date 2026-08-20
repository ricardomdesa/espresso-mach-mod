import React from 'react'
import { formatTimer } from '../utils/formatters'

interface TimerDisplayProps {
  seconds: number
  large?: boolean
}

const TimerDisplay: React.FC<TimerDisplayProps> = ({ seconds, large = false }) => {
  return (
    <div
      className={`font-mono tracking-wider ${
        large ? 'text-5xl font-bold' : 'text-2xl'
      }`}
      style={{ color: 'var(--color-accent)' }}
    >
      {formatTimer(seconds)}
    </div>
  )
}

export default TimerDisplay
