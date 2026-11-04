import React from 'react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export interface PieItem {
  name: string;
  value: number;
  color: string;
}

export interface DashboardAttendanceChartsProps {
  pieData: PieItem[];
  filteredAttendanceCount: number;
  onPieClick: (statusName: string) => void;
  classAttendanceData: any[];
  onBarClick: (classId: string) => void;
}

export const DashboardAttendanceCharts: React.FC<DashboardAttendanceChartsProps> = ({
  pieData,
  filteredAttendanceCount,
  onPieClick,
  classAttendanceData,
  onBarClick,
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Donut Chart (1 col) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Distribusi Kehadiran
          </h3>
          <p className="text-xs text-slate-400">Klik segmen untuk drill-down per kelas</p>
        </div>

        <div className="h-60 w-full my-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                onClick={(data) => {
                  if (data && data.name) {
                    onPieClick(data.name);
                  }
                }}
                className="cursor-pointer"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
              <Legend verticalAlign="bottom" height={36} iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-center text-[11px] text-slate-400">
          Total entri presensi: <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredAttendanceCount}</span>
        </div>
      </div>

      {/* Bar Chart: Comparison across classes (2 cols) */}
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Perbandingan Presensi per Kelas
          </h3>
          <p className="text-xs text-slate-400">Klik batang untuk melihat daftar siswa kelas</p>
        </div>

        <div className="h-60 w-full my-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={classAttendanceData}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  const classId = e.activePayload[0].payload.classId;
                  if (classId) onBarClick(classId);
                }
              }}
              className="cursor-pointer"
            >
              <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar dataKey="Hadir" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Terlambat" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Alpha" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-right text-[11px] text-slate-400">
          Pilih filter rentang waktu di kanan atas untuk melihat tren
        </div>
      </div>
    </div>
  );
};

export default DashboardAttendanceCharts;
