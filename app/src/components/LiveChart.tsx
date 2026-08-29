import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
          <XAxis
            dataKey="t"
            tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}s`}
            stroke={chartColors.axis}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            orientation="left"
            stroke={chartColors.temp}
            // Janela de ~50-95 °C (faixa real de extração desta máquina). Antes
            // era fixa em 80-100: a temperatura ficava colada na borda de baixo
            // e a oscilação virava uma linha reta. As funções deixam a escala
            // crescer se a leitura sair da janela, sem cortar o dado.
            domain={[
              (dataMin: number) => Math.min(50, Math.floor(dataMin - 2)),
              (dataMax: number) => Math.max(95, Math.ceil(dataMax + 2)),
            ]}
            tick={{ fontSize: 11 }}
            tickLine={false}
            width={38}
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
          <Line
            type="monotone"
            dataKey="temp"
            name="Temperatura"
            stroke={chartColors.temp}
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
