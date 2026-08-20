import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { WsFrame } from '../api/types'

interface LiveChartProps {
  data: WsFrame[]
}

const LiveChart: React.FC<LiveChartProps> = ({ data }) => {
  return (
    <div className="h-64 w-full rounded-lg bg-neutral-800 p-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#404040" />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => `${(v / 1000).toFixed(1)}s`}
            stroke="#a3a3a3"
          />
          <YAxis yAxisId="temp" orientation="left" stroke="#f59e0b" domain={[80, 100]} />
          <YAxis yAxisId="press" orientation="right" stroke="#22c55e" domain={[0, 12]} />
          <Tooltip
            contentStyle={{ backgroundColor: '#262626', border: '1px solid #404040' }}
            labelFormatter={(v: number) => `Tempo: ${(v / 1000).toFixed(1)}s`}
          />
          <Legend />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            name="Temperatura (°C)"
            stroke="#f59e0b"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="press"
            type="monotone"
            dataKey="press"
            name="Pressao (bar)"
            stroke="#22c55e"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default LiveChart
