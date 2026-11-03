import React, { useState, useMemo } from 'react';
import {
  Users,
  UserCheck,
  Clock,
  UserMinus,
  Award,
  AlertTriangle,
  ChevronRight,
  ArrowLeft,
  DoorOpen,
  TrendingDown,
  TrendingUp,
  GraduationCap,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Download,
  X,
  Calendar,
  Building,
} from 'lucide-react';
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
import { useApp } from '../context/AppContext.js';
import { StudentProfileModal } from '../components/modals/StudentProfileModal.js';
import { Student, SchoolClass } from '../types/index.js';
import { exportToExcel } from '../utils/excel.js';
import { formatIndonesianDate } from '../utils/time.js';

type DateFilter = 'today' | 'week' | 'month' | 'semester';

export const DashboardView: React.FC = () => {
  const {
    students,
    classes,
    attendance,
    outOfClass,
    violations,
    settings,
    currentServerTime,
  } = useApp();

  const [dateFilter, setDateFilter] = useState<DateFilter>('today');
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Drilldown state: breadcrumb path
  // null = overview, { level: 'class', classId } = list of students in class
  const [drilldown, setDrilldown] = useState<{ level: 'classes' | 'students'; classId?: string; statusFilter?: string } | null>(null);

  // Interactive Class Inspection Modal State
  const [selectedClassForInspection, setSelectedClassForInspection] = useState<SchoolClass | null>(null);
  const [classDetailStatusFilter, setClassDetailStatusFilter] = useState<'all' | 'hadir' | 'izin' | 'sakit' | 'alpha'>('all');
  const [classStudentSearch, setClassStudentSearch] = useState('');
  const [classGridSearch, setClassGridSearch] = useState('');

  // Date filtering logic
  const filteredAttendance = useMemo(() => {
    const todayStr = currentServerTime.toISOString().split('T')[0];
    const nowMs = currentServerTime.getTime();

    return attendance.filter((a) => {
      if (dateFilter === 'today') return a.date === todayStr;

      const recordMs = new Date(a.date).getTime();
      const diffDays = (nowMs - recordMs) / (1000 * 3600 * 24);

      if (dateFilter === 'week') return diffDays <= 7;
      if (dateFilter === 'month') return diffDays <= 30;
      if (dateFilter === 'semester') return diffDays <= 180;
      return true;
    });
  }, [attendance, dateFilter, currentServerTime]);

  const totalStudents = students.length;
  const hadirCount = filteredAttendance.filter((a) => a.status === 'Hadir').length;
  const terlambatCount = filteredAttendance.filter((a) => a.status === 'Terlambat').length;
  const izinCount = filteredAttendance.filter((a) => a.status === 'Izin').length;
  const sakitCount = filteredAttendance.filter((a) => a.status === 'Sakit').length;
  const alphaCount = filteredAttendance.filter((a) => a.status === 'Alpha').length;

  const totalAttendanceEntries = filteredAttendance.length || 1;
  const hadirPct = Math.round((hadirCount / totalAttendanceEntries) * 100);
  const terlambatPct = Math.round((terlambatCount / totalAttendanceEntries) * 100);
  const izinPct = Math.round((izinCount / totalAttendanceEntries) * 100);
  const sakitPct = Math.round((sakitCount / totalAttendanceEntries) * 100);
  const alphaPct = Math.round((alphaCount / totalAttendanceEntries) * 100);

  // Donut chart data
  const pieData = [
    { name: 'Hadir', value: hadirCount, color: '#10b981' },
    { name: 'Terlambat', value: terlambatCount, color: '#f59e0b' },
    { name: 'Izin', value: izinCount, color: '#3b82f6' },
    { name: 'Sakit', value: sakitCount, color: '#eab308' },
    { name: 'Alpha', value: alphaCount, color: '#ef4444' },
  ].filter((d) => d.value > 0);

  // Class comparison barchart data
  const classAttendanceData = useMemo(() => {
    return classes.map((c) => {
      const classAtt = filteredAttendance.filter((a) => {
        const s = students.find((std) => std.nis === a.student_id);
        return s?.class_id === c.id;
      });
      return {
        name: c.name,
        classId: c.id,
        Hadir: classAtt.filter((a) => a.status === 'Hadir').length,
        Terlambat: classAtt.filter((a) => a.status === 'Terlambat').length,
        Izin: classAtt.filter((a) => a.status === 'Izin').length,
        Alpha: classAtt.filter((a) => a.status === 'Alpha').length,
      };
    });
  }, [classes, filteredAttendance, students]);

  const todayStr = useMemo(() => {
    return currentServerTime.toISOString().split('T')[0];
  }, [currentServerTime]);

  // Real-time Class Attendance Breakdown for Today
  const classSummaries = useMemo(() => {
    return classes.map((c) => {
      const classStudents = students.filter((s) => s.class_id === c.id);
      const total = classStudents.length;

      let hadir = 0;
      let terlambat = 0;
      let izin = 0;
      let sakit = 0;
      let alpha = 0;

      classStudents.forEach((st) => {
        const att = attendance.find((a) => a.student_id === st.nis && a.date === todayStr);
        if (!att) {
          alpha++;
        } else if (att.status === 'Hadir') {
          hadir++;
        } else if (att.status === 'Terlambat') {
          terlambat++;
        } else if (att.status === 'Izin') {
          izin++;
        } else if (att.status === 'Sakit') {
          sakit++;
        } else if (att.status === 'Alpha') {
          alpha++;
        }
      });

      const totalHadir = hadir + terlambat;
      const pctHadir = total > 0 ? Math.round((totalHadir / total) * 100) : 0;

      return {
        cls: c,
        total,
        hadir,
        terlambat,
        totalHadir,
        izin,
        sakit,
        alpha,
        pctHadir,
      };
    });
  }, [classes, students, attendance, todayStr]);

  const filteredClassSummaries = useMemo(() => {
    if (!classGridSearch.trim()) return classSummaries;
    const q = classGridSearch.toLowerCase();
    return classSummaries.filter(
      (cs) =>
        cs.cls.name.toLowerCase().includes(q) ||
        cs.cls.major.toLowerCase().includes(q) ||
        (cs.cls.homeroom_teacher_name && cs.cls.homeroom_teacher_name.toLowerCase().includes(q))
    );
  }, [classSummaries, classGridSearch]);

  const inspectedStudents = useMemo(() => {
    if (!selectedClassForInspection) return [];
    const classStds = students.filter((s) => s.class_id === selectedClassForInspection.id);

    return classStds.map((st) => {
      const att = attendance.find((a) => a.student_id === st.nis && a.date === todayStr);
      let status: 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha' = 'Alpha';
      let checkInTime = '-';
      let lateMinutes = 0;
      let method = '-';
      let notes = '';

      if (att) {
        status = att.status;
        checkInTime = att.timestamp
          ? new Date(att.timestamp).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '-';
        lateMinutes = att.late_minutes || 0;
        method = att.method || '-';
        notes = att.notes || '';
      }

      return {
        student: st,
        status,
        checkInTime,
        lateMinutes,
        method,
        notes,
        hasAttended: Boolean(att),
      };
    });
  }, [selectedClassForInspection, students, attendance, todayStr]);

  const displayedInspectedStudents = useMemo(() => {
    return inspectedStudents.filter((item) => {
      if (classDetailStatusFilter === 'hadir' && item.status !== 'Hadir' && item.status !== 'Terlambat') return false;
      if (classDetailStatusFilter === 'izin' && item.status !== 'Izin') return false;
      if (classDetailStatusFilter === 'sakit' && item.status !== 'Sakit') return false;
      if (classDetailStatusFilter === 'alpha' && item.status !== 'Alpha') return false;

      if (classStudentSearch.trim()) {
        const q = classStudentSearch.toLowerCase();
        const matchesName = item.student.name.toLowerCase().includes(q);
        const matchesNis = item.student.nis.toLowerCase().includes(q);
        return matchesName || matchesNis;
      }
      return true;
    });
  }, [inspectedStudents, classDetailStatusFilter, classStudentSearch]);

  // Ranking Terlambat (Top 10 Students)
  const rankingLateStudents = useMemo(() => {
    const map: Record<string, { count: number; totalMinutes: number }> = {};
    filteredAttendance.forEach((a) => {
      if (a.status === 'Terlambat') {
        if (!map[a.student_id]) map[a.student_id] = { count: 0, totalMinutes: 0 };
        map[a.student_id].count += 1;
        map[a.student_id].totalMinutes += a.late_minutes || 0;
      }
    });
    return Object.entries(map)
      .map(([nis, data]) => ({
        student: students.find((s) => s.nis === nis),
        ...data,
      }))
      .filter((x) => x.student)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);
  }, [filteredAttendance, students]);

  // Ranking Terlambat Kembali ke Kelas (Top 10 Students)
  const rankingLateReturnStudents = useMemo(() => {
    const map: Record<string, { count: number; totalMinutes: number }> = {};
    outOfClass.forEach((o) => {
      if (o.late_return_minutes > 0) {
        if (!map[o.student_id]) map[o.student_id] = { count: 0, totalMinutes: 0 };
        map[o.student_id].count += 1;
        map[o.student_id].totalMinutes += o.late_return_minutes;
      }
    });
    return Object.entries(map)
      .map(([nis, data]) => ({
        student: students.find((s) => s.nis === nis),
        ...data,
      }))
      .filter((x) => x.student)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 10);
  }, [outOfClass, students]);

  // Ranking Disiplin (Top 10 Students)
  // formula: skor = 100 - poin pelanggaran - (keterlambatan x bobot) - (alpha x bobot) - (menit terlambat kembali x bobot) + bonus
  const rankingDiscipline = useMemo(() => {
    const lateW = settings.discipline_late_weight ?? 2;
    const alphaW = settings.discipline_alpha_weight ?? 10;
    const lateRetW = settings.discipline_late_return_weight ?? 1;

    return students
      .map((s) => {
        const sAtt = attendance.filter((a) => a.student_id === s.nis);
        const sOoc = outOfClass.filter((o) => o.student_id === s.nis);
        const sVio = violations.filter((v) => v.student_id === s.nis);

        const lates = sAtt.filter((a) => a.status === 'Terlambat').length;
        const alphas = sAtt.filter((a) => a.status === 'Alpha').length;
        const presents = sAtt.filter((a) => a.status === 'Hadir').length;
        const lateReturnMins = sOoc.reduce((acc, curr) => acc + (curr.late_return_minutes || 0), 0);

        const penaltyPoints = sVio
          .filter((v) => v.category !== 'prestasi')
          .reduce((acc, curr) => acc + curr.points, 0);

        const achievementPoints = sVio
          .filter((v) => v.category === 'prestasi')
          .reduce((acc, curr) => acc + curr.points, 0);

        const fullAttendanceBonus = alphas === 0 && lates === 0 && presents >= 5 ? (settings.discipline_full_attendance_bonus ?? 5) : 0;

        const score = Math.max(
          0,
          Math.min(
            100,
            100 -
              penaltyPoints +
              achievementPoints -
              lates * lateW -
              alphas * alphaW -
              lateReturnMins * lateRetW +
              fullAttendanceBonus
          )
        );

        return {
          student: s,
          score,
          penaltyPoints,
          achievementPoints,
          lates,
          alphas,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [students, attendance, outOfClass, violations, settings]);

  // "Siswa Disiplin Pekan Ini" award highlight (highest score with zero violations)
  const studentOfTheWeek = rankingDiscipline[0]?.student || students[0];

  // Active out of class right now
  const activeOutOfClass = outOfClass.filter(
    (o) => o.status === 'active' || o.status === 'overdue' || (!o.returned_at && o.status !== 'auto_closed')
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Date Filter */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Dasbor Presensi & Kedisiplinan
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Analisis statistik, grafik kehadiran, ranking kedisiplinan, dan drill-down data
            </p>
          </div>

          {/* Time range filter */}
          <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-0.5 text-xs font-medium">
            {(
              [
                ['today', 'Hari Ini'],
                ['week', 'Pekan Ini'],
                ['month', 'Bulan Ini'],
                ['semester', 'Semester'],
              ] as [DateFilter, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setDateFilter(val)}
                className={`px-3 py-1.5 rounded transition-colors ${
                  dateFilter === val
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* DRILLDOWN VIEW OR MAIN DASHBOARD */}
      {drilldown ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          {/* Breadcrumb Navigation (Bagian 7) */}
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setDrilldown(null)}
              className="flex items-center gap-1 text-slate-500 hover:text-slate-900 dark:hover:text-white"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Dasbor Utama</span>
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-semibold text-slate-900 dark:text-white">
              {drilldown.level === 'classes'
                ? `Drill-Down Status: ${drilldown.statusFilter}`
                : `Daftar Siswa Kelas ${drilldown.classId}`}
            </span>
          </div>

          {drilldown.level === 'classes' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {classes.map((cls) => {
                const count = filteredAttendance.filter((a) => {
                  const s = students.find((std) => std.nis === a.student_id);
                  return s?.class_id === cls.id && (!drilldown.statusFilter || a.status === drilldown.statusFilter);
                }).length;

                return (
                  <div
                    key={cls.id}
                    onClick={() => setDrilldown({ level: 'students', classId: cls.id, statusFilter: drilldown.statusFilter })}
                    className="p-4 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white block">{cls.name}</span>
                    <span className="text-[11px] text-slate-400">{cls.major}</span>
                    <p className="mt-2 text-xl font-bold font-mono text-slate-800 dark:text-slate-200">
                      {count} <span className="text-xs font-normal text-slate-500">siswa</span>
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {drilldown.level === 'students' && (
            <div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {students
                  .filter((s) => s.class_id === drilldown.classId)
                  .map((s) => {
                    const sAtt = filteredAttendance.filter((a) => a.student_id === s.nis);
                    const lastStatus = sAtt[0]?.status || 'Belum Presensi';
                    return (
                      <div
                        key={s.nis}
                        onClick={() => setProfileStudent(s)}
                        className="py-3 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 cursor-pointer rounded"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-800 dark:text-slate-200">
                            {s.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white hover:underline">{s.name}</p>
                            <p className="text-[10px] text-slate-400">NIS: {s.nis} • {s.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            lastStatus === 'Hadir' ? 'bg-emerald-100 text-emerald-800' :
                            lastStatus === 'Terlambat' ? 'bg-amber-100 text-amber-800' :
                            lastStatus === 'Alpha' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {lastStatus}
                          </span>
                          <span className="text-slate-400 text-[11px]">Buka Profil →</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Summary Stat Cards Today / Filtered (Bagian 7) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
              <span className="text-xs text-slate-500 dark:text-slate-400 block">Total Siswa</span>
              <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{totalStudents}</p>
              <span className="text-[10px] text-slate-400">Terdaftar Aktif</span>
            </div>

            <div
              onClick={() => setDrilldown({ level: 'classes', statusFilter: 'Hadir' })}
              className="p-4 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 shadow-sm cursor-pointer hover:bg-emerald-100/50 transition-colors"
            >
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium block">Hadir</span>
              <p className="text-2xl font-bold text-emerald-900 dark:text-emerald-200 mt-1">{hadirCount}</p>
              <span className="text-[10px] text-emerald-600 font-semibold">{hadirPct}% dari total</span>
            </div>

            <div
              onClick={() => setDrilldown({ level: 'classes', statusFilter: 'Terlambat' })}
              className="p-4 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/60 shadow-sm cursor-pointer hover:bg-amber-100/50 transition-colors"
            >
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium block">Terlambat</span>
              <p className="text-2xl font-bold text-amber-900 dark:text-amber-200 mt-1">{terlambatCount}</p>
              <span className="text-[10px] text-amber-600 font-semibold">{terlambatPct}% dari total</span>
            </div>

            <div
              onClick={() => setDrilldown({ level: 'classes', statusFilter: 'Izin' })}
              className="p-4 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/60 shadow-sm cursor-pointer hover:bg-blue-100/50 transition-colors"
            >
              <span className="text-xs text-blue-700 dark:text-blue-400 font-medium block">Izin</span>
              <p className="text-2xl font-bold text-blue-900 dark:text-blue-200 mt-1">{izinCount}</p>
              <span className="text-[10px] text-blue-600 font-semibold">{izinPct}% dari total</span>
            </div>

            <div
              onClick={() => setDrilldown({ level: 'classes', statusFilter: 'Sakit' })}
              className="p-4 rounded-lg bg-yellow-50/50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900/60 shadow-sm cursor-pointer hover:bg-yellow-100/50 transition-colors"
            >
              <span className="text-xs text-yellow-700 dark:text-yellow-400 font-medium block">Sakit</span>
              <p className="text-2xl font-bold text-yellow-900 dark:text-yellow-200 mt-1">{sakitCount}</p>
              <span className="text-[10px] text-yellow-600 font-semibold">{sakitPct}% dari total</span>
            </div>

            <div
              onClick={() => setDrilldown({ level: 'classes', statusFilter: 'Alpha' })}
              className="p-4 rounded-lg bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/60 shadow-sm cursor-pointer hover:bg-rose-100/50 transition-colors"
            >
              <span className="text-xs text-rose-700 dark:text-rose-400 font-medium block">Alpha</span>
              <p className="text-2xl font-bold text-rose-900 dark:text-rose-200 mt-1">{alphaCount}</p>
              <span className="text-[10px] text-rose-600 font-semibold">{alphaPct}% dari total</span>
            </div>
          </div>

          {/* FITUR KELAS INTERAKTIF: CEK PRESENSI, IZIN, SAKIT, ALPHA PER KELAS */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold">
                    <GraduationCap className="w-4 h-4" />
                  </div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Status Presensi Siswa per Kelas Hari Ini
                  </h2>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Klik kartu kelas di bawah untuk memeriksa daftar nama siswa yang sudah hadir, izin, sakit, maupun alpha/belum presensi.
                </p>
              </div>

              {/* Class search */}
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={classGridSearch}
                  onChange={(e) => setClassGridSearch(e.target.value)}
                  placeholder="Cari kelas atau jurusan..."
                  className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {filteredClassSummaries.length === 0 ? (
              <p className="text-xs text-slate-400 py-6 text-center">
                Tidak ada kelas yang cocok dengan pencarian &quot;{classGridSearch}&quot;.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 text-xs">
                {filteredClassSummaries.map((item) => (
                  <div
                    key={item.cls.id}
                    onClick={() => {
                      setSelectedClassForInspection(item.cls);
                      setClassDetailStatusFilter('all');
                      setClassStudentSearch('');
                    }}
                    className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/70 dark:hover:bg-slate-800 cursor-pointer transition-all duration-150 hover:shadow-xs group space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white text-sm group-hover:text-blue-600 transition-colors">
                            {item.cls.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                            {item.cls.major}
                          </span>
                        </div>
                        {item.cls.homeroom_teacher_name && (
                          <span className="text-[11px] text-slate-500 block truncate mt-0.5">
                            Wali: {item.cls.homeroom_teacher_name}
                          </span>
                        )}
                      </div>

                      <span className="text-xs font-bold text-slate-900 dark:text-white font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                        {item.pctHadir}%
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
                      <div
                        style={{ width: `${(item.hadir / (item.total || 1)) * 100}%` }}
                        className="bg-emerald-500 h-full"
                        title={`Hadir: ${item.hadir}`}
                      />
                      <div
                        style={{ width: `${(item.terlambat / (item.total || 1)) * 100}%` }}
                        className="bg-amber-500 h-full"
                        title={`Terlambat: ${item.terlambat}`}
                      />
                      <div
                        style={{ width: `${(item.izin / (item.total || 1)) * 100}%` }}
                        className="bg-blue-500 h-full"
                        title={`Izin: ${item.izin}`}
                      />
                      <div
                        style={{ width: `${(item.sakit / (item.total || 1)) * 100}%` }}
                        className="bg-yellow-500 h-full"
                        title={`Sakit: ${item.sakit}`}
                      />
                      <div
                        style={{ width: `${(item.alpha / (item.total || 1)) * 100}%` }}
                        className="bg-rose-500 h-full"
                        title={`Alpha: ${item.alpha}`}
                      />
                    </div>

                    {/* Status Pill Badges */}
                    <div className="grid grid-cols-4 gap-1 text-[11px] text-center pt-1 font-mono">
                      <div className="p-1 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40">
                        <span className="text-[9px] block text-emerald-600 font-sans font-medium">Hadir</span>
                        <span className="font-bold">{item.totalHadir}</span>
                      </div>
                      <div className="p-1 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40">
                        <span className="text-[9px] block text-blue-600 font-sans font-medium">Izin</span>
                        <span className="font-bold">{item.izin}</span>
                      </div>
                      <div className="p-1 rounded bg-yellow-50 dark:bg-yellow-950/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200/60 dark:border-yellow-800/40">
                        <span className="text-[9px] block text-yellow-600 font-sans font-medium">Sakit</span>
                        <span className="font-bold">{item.sakit}</span>
                      </div>
                      <div className="p-1 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40">
                        <span className="text-[9px] block text-rose-600 font-sans font-medium">Alpha</span>
                        <span className="font-bold">{item.alpha}</span>
                      </div>
                    </div>

                    <div className="pt-1 flex items-center justify-between text-[11px] text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 border-t border-slate-100 dark:border-slate-800">
                      <span>Total {item.total} Siswa</span>
                      <span className="inline-flex items-center gap-0.5 font-medium text-slate-700 dark:text-slate-300">
                        Cek Siswa <ChevronRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Award "Siswa Disiplin Pekan Ini" Highlight Card (Bagian 7) */}
          {studentOfTheWeek && (
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-lg p-5 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-full bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <div className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-400/20 text-amber-300 uppercase tracking-wider mb-1">
                    Penghargaan Siswa Disiplin Pekan Ini
                  </div>
                  <h3
                    onClick={() => setProfileStudent(studentOfTheWeek)}
                    className="text-base font-bold cursor-pointer hover:underline"
                  >
                    {studentOfTheWeek.name}
                  </h3>
                  <p className="text-xs text-slate-300">
                    Kelas {studentOfTheWeek.class_id} • NIS: {studentOfTheWeek.nis} • Kehadiran 100% & Bebas Pelanggaran
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileStudent(studentOfTheWeek)}
                className="px-4 py-2 rounded bg-white text-slate-900 font-semibold text-xs hover:bg-slate-100 transition-colors shrink-0"
              >
                Lihat Profil Lengkap
              </button>
            </div>
          )}

          {/* Charts Row: Donut + Bar (Bagian 7) */}
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
                          setDrilldown({ level: 'classes', statusFilter: data.name });
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
                Total entri presensi: <span className="font-semibold text-slate-700 dark:text-slate-300">{filteredAttendance.length}</span>
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
                        setDrilldown({ level: 'students', classId });
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

          {/* Three Ranking Tables Row (Bagian 7) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Ranking 1: Top 10 Terlambat */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
              <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Top 10 Siswa Terlambat
              </h3>
              {rankingLateStudents.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Tidak ada siswa terlambat.</p>
              ) : (
                <div className="space-y-2">
                  {rankingLateStudents.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => item.student && setProfileStudent(item.student)}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 px-1 rounded"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-medium text-slate-900 dark:text-white truncate block">
                          {idx + 1}. {item.student?.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Kelas {item.student?.class_id} • {item.count}x terlambat
                        </span>
                      </div>
                      <span className="font-bold text-amber-600 font-mono shrink-0">
                        +{item.totalMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ranking 2: Top 10 Terlambat Kembali ke Kelas (Bagian 7) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
              <h3 className="font-semibold text-rose-700 dark:text-rose-400 mb-3 flex items-center gap-1.5">
                <DoorOpen className="w-4 h-4" /> Top 10 Terlambat Kembali
              </h3>
              {rankingLateReturnStudents.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Tidak ada siswa terlambat kembali.</p>
              ) : (
                <div className="space-y-2">
                  {rankingLateReturnStudents.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => item.student && setProfileStudent(item.student)}
                      className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 px-1 rounded"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-medium text-slate-900 dark:text-white truncate block">
                          {idx + 1}. {item.student?.name}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Kelas {item.student?.class_id} • {item.count}x melebihi batas
                        </span>
                      </div>
                      <span className="font-bold text-rose-600 font-mono shrink-0">
                        +{item.totalMinutes}m
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ranking 3: Top 10 Disiplin (Bagian 7 Formula) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
              <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
                <Award className="w-4 h-4" /> Top 10 Siswa Paling Disiplin
              </h3>
              <div className="space-y-2">
                {rankingDiscipline.map((item, idx) => (
                  <div
                    key={idx}
                    onClick={() => setProfileStudent(item.student)}
                    className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 px-1 rounded"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-medium text-slate-900 dark:text-white truncate block">
                        {idx + 1}. {item.student.name}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        Kelas {item.student.class_id}
                      </span>
                    </div>
                    <span className="font-bold text-emerald-600 font-mono shrink-0">
                      {item.score} <span className="text-[10px] text-slate-400">skor</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Real-time active "Sedang Keluar Kelas" overview panel */}
          {activeOutOfClass.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <DoorOpen className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    Siswa Sedang Berada di Luar Kelas Saat Ini ({activeOutOfClass.length} Siswa)
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {activeOutOfClass.map((o) => {
                  const s = students.find((std) => std.nis === o.student_id);
                  return (
                    <div
                      key={o.id}
                      onClick={() => s && setProfileStudent(s)}
                      className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 cursor-pointer hover:bg-amber-100"
                    >
                      <span className="font-semibold">{s?.name || o.student_id}</span> ({o.class_id}) • {o.type}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Student Profile Modal Drilldown */}
      <StudentProfileModal
        student={profileStudent}
        onClose={() => setProfileStudent(null)}
      />

      {/* MODAL PEMERIKSAAN KEHADIRAN SISWA PER KELAS */}
      {selectedClassForInspection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs">
            {/* Header Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-sm">
                  <GraduationCap className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Rincian Presensi Kelas: {selectedClassForInspection.name}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold uppercase">
                      {selectedClassForInspection.major}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                    <span>Wali Kelas: <strong>{selectedClassForInspection.homeroom_teacher_name || 'Belum ditentukan'}</strong></span>
                    <span>•</span>
                    <span>Tanggal: <strong>{formatIndonesianDate(currentServerTime)}</strong></span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassForInspection(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Pills & Summary Counter Bar */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Status Filter Tabs */}
                <div className="flex flex-wrap gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">
                  <button
                    type="button"
                    onClick={() => setClassDetailStatusFilter('all')}
                    className={`px-3 py-1.5 rounded font-medium transition-colors ${
                      classDetailStatusFilter === 'all'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Semua ({inspectedStudents.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassDetailStatusFilter('hadir')}
                    className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
                      classDetailStatusFilter === 'hadir'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Hadir ({inspectedStudents.filter((i) => i.status === 'Hadir' || i.status === 'Terlambat').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassDetailStatusFilter('izin')}
                    className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
                      classDetailStatusFilter === 'izin'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
                    }`}
                  >
                    Izin ({inspectedStudents.filter((i) => i.status === 'Izin').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassDetailStatusFilter('sakit')}
                    className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
                      classDetailStatusFilter === 'sakit'
                        ? 'bg-yellow-600 text-white shadow-xs'
                        : 'text-yellow-700 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-950/40'
                    }`}
                  >
                    Sakit ({inspectedStudents.filter((i) => i.status === 'Sakit').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setClassDetailStatusFilter('alpha')}
                    className={`px-3 py-1.5 rounded font-medium transition-colors inline-flex items-center gap-1.5 ${
                      classDetailStatusFilter === 'alpha'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                    }`}
                  >
                    <AlertCircle className="w-3.5 h-3.5" />
                    Alpha / Belum Presensi ({inspectedStudents.filter((i) => i.status === 'Alpha').length})
                  </button>
                </div>

                {/* Search input in modal */}
                <div className="relative w-full sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={classStudentSearch}
                    onChange={(e) => setClassStudentSearch(e.target.value)}
                    placeholder="Cari siswa atau NIS..."
                    className="w-full pl-8 pr-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Students Table */}
            <div className="flex-1 overflow-y-auto p-4">
              {displayedInspectedStudents.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="font-medium">Tidak ada siswa yang sesuai dengan filter.</p>
                  <span className="text-[11px] text-slate-500">Coba ubah filter status atau kata kunci pencarian.</span>
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-semibold">
                      <tr>
                        <th className="px-3 py-2 w-10 text-center">No</th>
                        <th className="px-3 py-2 w-28">NIS / NISN</th>
                        <th className="px-3 py-2">Nama Siswa</th>
                        <th className="px-3 py-2 w-16 text-center">L/P</th>
                        <th className="px-3 py-2 w-40 text-center">Status Kehadiran</th>
                        <th className="px-3 py-2 w-32">Waktu Scan</th>
                        <th className="px-3 py-2">Keterangan</th>
                        <th className="px-3 py-2 text-right w-20">Profil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {displayedInspectedStudents.map((item, index) => (
                        <tr
                          key={item.student.nis}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                        >
                          <td className="px-3 py-2.5 text-center font-mono text-slate-400">
                            {index + 1}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                            {item.student.nis}
                          </td>
                          <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-white">
                            {item.student.name}
                          </td>
                          <td className="px-3 py-2.5 text-center font-medium">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              item.student.gender === 'L' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-300'
                            }`}>
                              {item.student.gender || 'L'}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {item.status === 'Hadir' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                <CheckCircle2 className="w-3 h-3" /> Hadir Tepat Waktu
                              </span>
                            ) : item.status === 'Terlambat' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                <Clock className="w-3 h-3" /> Terlambat ({item.lateMinutes}m)
                              </span>
                            ) : item.status === 'Izin' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                Izin
                              </span>
                            ) : item.status === 'Sakit' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300">
                                Sakit
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                <AlertCircle className="w-3 h-3" /> Alpha / Belum Presensi
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400">
                            {item.checkInTime !== '-' ? (
                              <span>{item.checkInTime} <span className="text-[10px] text-slate-400 uppercase">({item.method})</span></span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-slate-500 truncate max-w-xs">
                            {item.notes || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => setProfileStudent(item.student)}
                              className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer Modal */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="text-[11px] text-slate-500">
                Menampilkan <strong>{displayedInspectedStudents.length}</strong> dari <strong>{inspectedStudents.length}</strong> siswa kelas {selectedClassForInspection.name}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const exportData = inspectedStudents.map((item, idx) => ({
                      No: idx + 1,
                      NIS: item.student.nis,
                      Nama: item.student.name,
                      Kelas: selectedClassForInspection.name,
                      Gender: item.student.gender || 'L',
                      Status_Kehadiran: item.status,
                      Waktu_Presensi: item.checkInTime,
                      Keterlambatan_Menit: item.lateMinutes,
                      Metode_Scan: item.method,
                      Catatan: item.notes,
                    }));
                    exportToExcel(exportData, `Rekap_Kehadiran_${selectedClassForInspection.name}_${todayStr}`);
                  }}
                  className="px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-100 dark:hover:bg-slate-700 inline-flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Ekspor Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedClassForInspection(null)}
                  className="px-4 py-1.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold hover:bg-slate-800"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
