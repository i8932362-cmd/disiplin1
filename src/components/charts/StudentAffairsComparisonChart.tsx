import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';

export interface ComparisonItem {
  name: string;
  Hadir: number;
  Terlambat: number;
  Alpha: number;
  PoinPelanggaran: number;
}

export interface StudentAffairsComparisonChartProps {
  comparisonData: ComparisonItem[];
}

export const StudentAffairsComparisonChart: React.FC<StudentAffairsComparisonChartProps> = ({
  comparisonData,
}) => {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={comparisonData}>
          <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
          <YAxis stroke="#94a3b8" fontSize={11} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: '11px' }} />
          <Bar dataKey="Hadir" fill="#10b981" />
          <Bar dataKey="Terlambat" fill="#f59e0b" />
          <Bar dataKey="Alpha" fill="#ef4444" />
          <Bar dataKey="PoinPelanggaran" fill="#8884d8" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StudentAffairsComparisonChart;
