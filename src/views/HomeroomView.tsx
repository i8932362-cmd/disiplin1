import React, { useState, useMemo } from 'react';
import {
  GraduationCap,
  Users,
  Calendar,
  Award,
  FileSpreadsheet,
  Printer,
  Check,
  X,
  AlertTriangle,
  Clock,
  DoorOpen,
  Lock,
  Mail,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { useApp } from '../context/AppContext.js';
import { StudentProfileModal } from '../components/modals/StudentProfileModal.js';
import { exportToExcel } from '../utils/excel.js';
import { Student, LeaveRequest } from '../types/index.js';

export const HomeroomView: React.FC = () => {
  const {
    session,
    classes,
    sessions,
    students,
    attendance,
    outOfClass,
    violations,
    leaveRequests,
    settings,
    approveLeaveRequest,
    sendWeeklyRecap,
    lockCurrentMenu,
    showToast,
  } = useApp();

  const [selectedClassId, setSelectedClassId] = useState<string>(session?.lockedMenuClassId || classes[0]?.id || '');

  React.useEffect(() => {
    if (session?.lockedMenuClassId) {
      setSelectedClassId(session.lockedMenuClassId);
    }
  }, [session?.lockedMenuClassId]);

  const classId = selectedClassId || session?.lockedMenuClassId || classes[0]?.id || '';
  const currentClass = classes.find((c) => c.id === classId) || classes[0];

  const [activeTab, setActiveTab] = useState<
    'student' | 'daily' | 'weekly' | 'monthly' | 'semester' | 'ranking' | 'discipline' | 'leave_approval'
  >('student');

  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Students belonging to this homeroom class
  const classStudents = useMemo(() => {
    return students.filter((s) => s.class_id === classId);
  }, [students, classId]);

  // Attendance belonging to this class
  const classAttendance = useMemo(() => {
    return attendance.filter((a) => {
      const s = students.find((std) => std.nis === a.student_id);
      return s?.class_id === classId;
    });
  }, [attendance, students, classId]);

  // Out of class belonging to this class
  const classOutOfClass = useMemo(() => {
    return outOfClass.filter((o) => o.class_id === classId);
  }, [outOfClass, classId]);

  // Violations belonging to this class
  const classViolations = useMemo(() => {
    return violations.filter((v) => v.class_id === classId);
  }, [violations, classId]);

  // Pending leave requests for this class
  const classLeaveRequests = useMemo(() => {
    return leaveRequests.filter((l) => l.class_id === classId);
  }, [leaveRequests, classId]);

  // Per-student recap stats
  const studentRecapData = useMemo(() => {
    const lateW = settings.discipline_late_weight ?? 2;
    const alphaW = settings.discipline_alpha_weight ?? 10;
    const lateRetW = settings.discipline_late_return_weight ?? 1;

    return classStudents.map((s) => {
      const sAtt = classAttendance.filter((a) => a.student_id === s.nis);
      const sOoc = classOutOfClass.filter((o) => o.student_id === s.nis);
      const sVio = classViolations.filter((v) => v.student_id === s.nis);

      const hadir = sAtt.filter((a) => a.status === 'Hadir').length;
      const terlambat = sAtt.filter((a) => a.status === 'Terlambat').length;
      const totalLateMins = sAtt.reduce((acc, curr) => acc + (curr.late_minutes || 0), 0);
      const izin = sAtt.filter((a) => a.status === 'Izin').length;
      const sakit = sAtt.filter((a) => a.status === 'Sakit').length;
      const alpha = sAtt.filter((a) => a.status === 'Alpha').length;

      const penaltyPts = sVio
        .filter((v) => v.category !== 'prestasi')
        .reduce((acc, curr) => acc + curr.points, 0);

      const achievementPts = sVio
        .filter((v) => v.category === 'prestasi')
        .reduce((acc, curr) => acc + curr.points, 0);

      const lateRetMins = sOoc.reduce((acc, curr) => acc + (curr.late_return_minutes || 0), 0);

      const bonus = alpha === 0 && terlambat === 0 && hadir >= 5 ? (settings.discipline_full_attendance_bonus ?? 5) : 0;

      const score = Math.max(
        0,
        Math.min(
          100,
          100 -
            penaltyPts +
            achievementPts -
            terlambat * lateW -
            alpha * alphaW -
            lateRetMins * lateRetW +
            bonus
        )
      );

      return {
        student: s,
        hadir,
        terlambat,
        totalLateMins,
        izin,
        sakit,
        alpha,
        penaltyPts,
        achievementPts,
        lateRetMins,
        score,
      };
    });
  }, [classStudents, classAttendance, classOutOfClass, classViolations, settings]);

  const handleExportExcel = () => {
    const data = studentRecapData.map((row) => ({
      NIS: row.student.nis,
      Nama: row.student.name,
      Kelas: row.student.class_id,
      Hadir: row.hadir,
      Terlambat: row.terlambat,
      'Menit Terlambat': row.totalLateMins,
      Izin: row.izin,
      Sakit: row.sakit,
      Alpha: row.alpha,
      'Poin Pelanggaran': row.penaltyPts,
      'Poin Prestasi': row.achievementPts,
      'Menit Telat Kembali': row.lateRetMins,
      'Skor Disiplin': row.score,
    }));
    exportToExcel(data, `rekap_kelas_${classId}_${new Date().toISOString().split('T')[0]}`);
    showToast('Rekap kelas berhasil diekspor ke Excel.', 'success');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Info */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Portal Wali Kelas: {currentClass ? currentClass.name : classId}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Wali Kelas: <span className="font-semibold">{session?.name || currentClass?.homeroom_teacher_name}</span> • Jurusan: {currentClass?.major} • {classStudents.length} Siswa
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Class Selector */}
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-medium hidden sm:inline">Pilih Kelas:</span>
              <select
                value={classId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="px-2.5 py-1.5 rounded text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none"
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} ({cls.id})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor Excel</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak PDF</span>
            </button>
            <button
              type="button"
              onClick={lockCurrentMenu}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-semibold text-xs transition-colors shadow-xs"
              title="Kunci Akses Wali Kelas (Wajib Masukkan Password Kembali)"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci & Keluar</span>
            </button>
          </div>
        </div>

        {/* Email Rekap Mingguan Info & Action */}
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Mail className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Email Wali Kelas (Diatur Admin):</span>
            {currentClass?.homeroom_teacher_email ? (
              <span className="font-mono font-bold text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                {currentClass.homeroom_teacher_email}
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                Belum diatur oleh Admin di menu Kelola Kelas
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => sendWeeklyRecap(classId)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Kirim Rekap Pekanan ke Email Saya Sekarang</span>
          </button>
        </div>

        {/* 8 Tabs Navigation (Bagian 8) */}
        <div className="flex overflow-x-auto gap-2 pt-4 text-xs font-medium border-slate-100 dark:border-slate-800">
          {[
            ['student', '1. Rekap Siswa'],
            ['daily', '2. Rekap Hari'],
            ['weekly', '3. Rekap Pekan'],
            ['monthly', '4. Rekap Bulan'],
            ['semester', '5. Semester'],
            ['ranking', '6. Ranking'],
            ['discipline', '7. Izin & Pelanggaran'],
            ['leave_approval', `8. Persetujuan (${classLeaveRequests.filter((l) => l.status === 'pending').length})`],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`px-3 py-1.5 rounded whitespace-nowrap transition-colors ${
                activeTab === id
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-semibold'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* TAB 1: REKAP PER SISWA */}
      {activeTab === 'student' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Rekapitulasi Kehadiran & Skor Disiplin Seluruh Siswa ({classStudents.length} Siswa)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5">NIS</th>
                  <th className="py-2.5">Nama Siswa</th>
                  <th className="py-2.5 text-center">Hadir</th>
                  <th className="py-2.5 text-center">Terlambat</th>
                  <th className="py-2.5 text-center">Izin</th>
                  <th className="py-2.5 text-center">Sakit</th>
                  <th className="py-2.5 text-center">Alpha</th>
                  <th className="py-2.5 text-center">Poin Pelanggaran</th>
                  <th className="py-2.5 text-center">Skor Disiplin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentRecapData.map((row) => (
                  <tr
                    key={row.student.nis}
                    onClick={() => setProfileStudent(row.student)}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 cursor-pointer"
                  >
                    <td className="py-2.5 font-mono text-[11px] text-slate-400">{row.student.nis}</td>
                    <td className="py-2.5 font-medium text-slate-900 dark:text-white hover:underline">
                      {row.student.name}
                    </td>
                    <td className="py-2.5 text-center font-bold text-emerald-600">{row.hadir}</td>
                    <td className="py-2.5 text-center font-bold text-amber-600">
                      {row.terlambat} {row.totalLateMins > 0 ? `(${row.totalLateMins}m)` : ''}
                    </td>
                    <td className="py-2.5 text-center text-blue-600">{row.izin}</td>
                    <td className="py-2.5 text-center text-yellow-600">{row.sakit}</td>
                    <td className="py-2.5 text-center font-bold text-rose-600">{row.alpha}</td>
                    <td className="py-2.5 text-center font-mono">
                      <span className={row.penaltyPts > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}>
                        {row.penaltyPts} Poin
                      </span>
                    </td>
                    <td className="py-2.5 text-center font-mono font-bold">
                      <span
                        className={
                          row.score >= 85
                            ? 'text-emerald-600'
                            : row.score >= 70
                            ? 'text-amber-600'
                            : 'text-rose-600'
                        }
                      >
                        {row.score}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: REKAP PER HARI */}
      {activeTab === 'daily' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Status Kehadiran Siswa per Hari
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Pilih Tanggal:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2">NIS</th>
                  <th className="py-2">Nama Siswa</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Jam Presensi</th>
                  <th className="py-2">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {classStudents.map((s) => {
                  const record = classAttendance.find((a) => a.student_id === s.nis && a.date === selectedDate);
                  const status = record?.status || 'Belum Presensi';
                  return (
                    <tr key={s.nis}>
                      <td className="py-2 font-mono text-[11px] text-slate-400">{s.nis}</td>
                      <td className="py-2 font-medium text-slate-900 dark:text-white">{s.name}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            status === 'Hadir'
                              ? 'bg-emerald-100 text-emerald-800'
                              : status === 'Terlambat'
                              ? 'bg-amber-100 text-amber-800'
                              : status === 'Alpha'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {status} {record?.late_minutes ? `(+${record.late_minutes}m)` : ''}
                        </span>
                      </td>
                      <td className="py-2 font-mono text-[11px] text-slate-500">
                        {record?.timestamp ? new Date(record.timestamp).toLocaleTimeString('id-ID') : '-'}
                      </td>
                      <td className="py-2 text-slate-400">{record?.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3 & 4 & 5: TREND GRAFIK MINGGUAN & BULANAN */}
      {(activeTab === 'weekly' || activeTab === 'monthly' || activeTab === 'semester') && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Grafik Tren Presensi Kelas {currentClass?.name} ({activeTab.toUpperCase()})
          </h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  { period: 'Pekan 1', Hadir: 28, Terlambat: 2, Alpha: 0 },
                  { period: 'Pekan 2', Hadir: 29, Terlambat: 1, Alpha: 0 },
                  { period: 'Pekan 3', Hadir: 27, Terlambat: 3, Alpha: 1 },
                  { period: 'Pekan 4', Hadir: 30, Terlambat: 0, Alpha: 0 },
                ]}
              >
                <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <Tooltip />
                <Line type="monotone" dataKey="Hadir" stroke="#10b981" strokeWidth={2} />
                <Line type="monotone" dataKey="Terlambat" stroke="#f59e0b" strokeWidth={2} />
                <Line type="monotone" dataKey="Alpha" stroke="#ef4444" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Tabel Rincian Rekap per Sesi Presensi untuk Pekan Ini */}
          {activeTab === 'weekly' && (
            <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Rincian Rekapitulasi Presensi per Sesi (Laporan Email Mingguan)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Data di bawah ini merupakan ringkasan yang dikirimkan ke email wali kelas ({currentClass?.homeroom_teacher_email || 'email belum diatur'}).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => sendWeeklyRecap(classId)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs"
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>Kirim Laporan Ini ke Email Sekarang</span>
                </button>
              </div>

              <div className="space-y-3">
                {sessions.filter((sess) => sess.is_active).map((sess) => {
                  const sessAttendance = classAttendance.filter((a) => a.session_id === sess.id);
                  const hadir = sessAttendance.filter((a) => a.status === 'Hadir').length;
                  const terlambat = sessAttendance.filter((a) => a.status === 'Terlambat').length;
                  const izin = sessAttendance.filter((a) => a.status === 'Izin').length;
                  const sakit = sessAttendance.filter((a) => a.status === 'Sakit').length;
                  const alpha = sessAttendance.filter((a) => a.status === 'Alpha').length;

                  return (
                    <div
                      key={sess.id}
                      className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs"
                    >
                      <div className="bg-slate-100 dark:bg-slate-800/80 p-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span className="font-bold text-slate-900 dark:text-white">{sess.name}</span>
                          <span className="font-mono text-slate-500 text-[11px]">
                            ({sess.start_time} - {sess.end_time} WIB)
                          </span>
                        </div>
                        <div className="flex items-center gap-3 font-semibold text-[11px]">
                          <span className="text-emerald-600">Hadir: {hadir}</span>
                          <span className="text-amber-600">Terlambat: {terlambat}</span>
                          <span className="text-blue-600">Izin: {izin}</span>
                          <span className="text-purple-600">Sakit: {sakit}</span>
                          <span className="text-rose-600">Alpha: {alpha}</span>
                        </div>
                      </div>

                      <div className="max-h-48 overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 font-semibold text-[11px]">
                              <th className="py-1.5 px-3">NIS</th>
                              <th className="py-1.5 px-3">Nama Siswa</th>
                              <th className="py-1.5 px-3 text-center">Hadir</th>
                              <th className="py-1.5 px-3 text-center">Terlambat</th>
                              <th className="py-1.5 px-3 text-center">Izin</th>
                              <th className="py-1.5 px-3 text-center">Sakit</th>
                              <th className="py-1.5 px-3 text-center">Alpha</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {classStudents.map((s) => {
                              const sRecs = sessAttendance.filter((a) => a.student_id === s.nis);
                              const h = sRecs.filter((a) => a.status === 'Hadir').length;
                              const t = sRecs.filter((a) => a.status === 'Terlambat').length;
                              const i = sRecs.filter((a) => a.status === 'Izin').length;
                              const sk = sRecs.filter((a) => a.status === 'Sakit').length;
                              const a = sRecs.filter((a) => a.status === 'Alpha').length;

                              return (
                                <tr key={s.nis} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="py-1.5 px-3 font-mono text-[11px] text-slate-400">{s.nis}</td>
                                  <td className="py-1.5 px-3 font-medium text-slate-900 dark:text-white">{s.name}</td>
                                  <td className="py-1.5 px-3 text-center font-semibold text-emerald-600">{h}</td>
                                  <td className="py-1.5 px-3 text-center font-semibold text-amber-600">{t}</td>
                                  <td className="py-1.5 px-3 text-center text-blue-600">{i}</td>
                                  <td className="py-1.5 px-3 text-center text-purple-600">{sk}</td>
                                  <td className="py-1.5 px-3 text-center font-bold text-rose-600">{a}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: RANKING KHUSUS KELAS INI */}
      {activeTab === 'ranking' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Siswa Paling Sering Terlambat
            </h3>
            {studentRecapData
              .filter((r) => r.terlambat > 0)
              .sort((a, b) => b.totalLateMins - a.totalLateMins)
              .slice(0, 5)
              .map((r, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{r.student.name}</span>
                  <span className="font-bold text-amber-600">+{r.totalLateMins}m ({r.terlambat}x)</span>
                </div>
              ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-rose-700 dark:text-rose-400 mb-3 flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4" /> Siswa Terlambat Kembali Kelas
            </h3>
            {studentRecapData
              .filter((r) => r.lateRetMins > 0)
              .sort((a, b) => b.lateRetMins - a.lateRetMins)
              .slice(0, 5)
              .map((r, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{r.student.name}</span>
                  <span className="font-bold text-rose-600">+{r.lateRetMins} menit</span>
                </div>
              ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Top Disiplin Kelas
            </h3>
            {studentRecapData
              .sort((a, b) => b.score - a.score)
              .slice(0, 5)
              .map((r, idx) => (
                <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="font-medium text-slate-800 dark:text-slate-200">{r.student.name}</span>
                  <span className="font-bold text-emerald-600">{r.score} Skor</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* TAB 7: IZIN KELUAR & PELANGGARAN KELAS */}
      {activeTab === 'discipline' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
              Catatan Pelanggaran Siswa Kelas {currentClass?.name}
            </h3>
            {classViolations.length === 0 ? (
              <p className="text-slate-400 py-4 text-center">Kelas ini bebas dari pelanggaran.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {classViolations.map((v) => {
                  const student = students.find((s) => s.nis === v.student_id);
                  return (
                    <div key={v.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white">{student?.name}</span>
                        <p className="text-[11px] text-slate-500">{v.type_name} ({v.notes || 'Tanpa catatan'})</p>
                      </div>
                      <span className="font-mono font-bold text-rose-600">-{v.points} Poin</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 8: PERSETUJUAN IZIN / SAKIT */}
      {activeTab === 'leave_approval' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Persetujuan Surat Izin / Sakit Siswa
          </h2>

          {classLeaveRequests.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Belum ada permohonan surat izin atau sakit yang diajukan.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {classLeaveRequests.map((req) => {
                const s = students.find((std) => std.nis === req.student_id);
                return (
                  <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{s?.name || req.student_id}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                          {req.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Tanggal: {req.start_date} s/d {req.end_date} • Alasan: {req.reason}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => approveLeaveRequest(req.id, 'approved')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                          >
                            <Check className="w-3.5 h-3.5" /> Setujui
                          </button>
                          <button
                            type="button"
                            onClick={() => approveLeaveRequest(req.id, 'rejected', 'Alasan tidak memenuhi kriteria')}
                            className="flex items-center gap-1 px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs"
                          >
                            <X className="w-3.5 h-3.5" /> Tolak
                          </button>
                        </>
                      ) : (
                        <span className="capitalize font-semibold text-slate-500">
                          {req.status === 'approved' ? 'Disetujui' : 'Ditolak'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Student Profile Drilldown */}
      <StudentProfileModal
        student={profileStudent}
        onClose={() => setProfileStudent(null)}
      />
    </div>
  );
};
