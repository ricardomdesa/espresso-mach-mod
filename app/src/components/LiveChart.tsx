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
import { chartColors } from '../theme'

interface LiveChartProps {
  data: WsFrame[]
}

const LiveChart: React.FC<LiveChartProps> = ({ data }) => {
  return (
    <div className="h-56 w-full rounded-2xl border border-line bg-cream p-2 shadow-card">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}s`}
            stroke={chartColors.axis}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            yAxisId="temp"
            orientation="left"
            stroke={chartColors.temp}
            domain={[80, 100]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={38}
          />
          <YAxis
            yAxisId="press"
            orientation="right"
            stroke={chartColors.press}
            domain={[0, 12]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartColors.tooltipBg,
              border: `1px solid ${chartColors.tooltipBorder}`,
              borderRadius: 12,
              color: chartColors.tooltipText,
              fontSize: 12,
            }}
            labelFormatter={(v: number) => `Tempo: ${(v / 1000).toFixed(1)}s`}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: chartColors.axis }} />
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temp"
            name="Temperatura"
            stroke={chartColors.temp}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="press"
            type="monotone"
            dataKey="press"
            name="Pressao"
            stroke={chartColors.press}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default LiveChart
