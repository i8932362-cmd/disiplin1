import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

export interface TrendDataPoint {
  period: string;
  Hadir: number;
  Terlambat: number;
  Alpha: number;
}

export interface HomeroomTrendChartProps {
  data?: TrendDataPoint[];
}

export const HomeroomTrendChart: React.FC<HomeroomTrendChartProps> = ({
  data = [
    { period: 'Pekan 1', Hadir: 28, Terlambat: 2, Alpha: 0 },
    { period: 'Pekan 2', Hadir: 29, Terlambat: 1, Alpha: 0 },
    { period: 'Pekan 3', Hadir: 27, Terlambat: 3, Alpha: 1 },
    { period: 'Pekan 4', Hadir: 30, Terlambat: 0, Alpha: 0 },
  ],
}) => {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} />
          <Tooltip />
          <Line type="monotone" dataKey="Hadir" stroke="#10b981" strokeWidth={2} />
          <Line type="monotone" dataKey="Terlambat" stroke="#f59e0b" strokeWidth={2} />
          <Line type="monotone" dataKey="Alpha" stroke="#ef4444" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HomeroomTrendChart;
