import React, { useState, useEffect } from 'react';
import {
  DoorOpen,
  Search,
  CheckCircle,
  AlertTriangle,
  Clock,
  User,
  Users,
  Check,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import {
  calculateRemainingSeconds,
  calculateOverdueSeconds,
  formatDuration,
} from '../utils/time.js';
import { soundEffects } from '../utils/audio.js';
import { Student, OutOfClassRecord, OutOfClassType } from '../types/index.js';

export const OutOfClassView: React.FC = () => {
  const {
    students,
    classes,
    outOfClass,
    settings,
    startOutOfClass,
    confirmOutOfClassReturn,
    currentServerTime,
    speak,
    showToast,
  } = useApp();

  // Search and form state (NO RFID/Barcode Scan here as required in Bagian 5)
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [permissionType, setPermissionType] = useState<OutOfClassType>('BAK');
  const [customDuration, setCustomDuration] = useState<number>(settings.out_of_class_bak_duration || 5);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Today's out of class records
  const todayStr = currentServerTime.toISOString().split('T')[0];
  const todayRecords = outOfClass.filter((o) => o.started_at.startsWith(todayStr));

  // Active / Overdue records (currently outside)
  const activeRecords = todayRecords.filter(
    (o) => o.status === 'active' || o.status === 'overdue' || (!o.returned_at && o.status !== 'auto_closed')
  );

  // Returned records today
  const returnedRecords = todayRecords.filter(
    (o) => o.status === 'returned' || o.status === 'auto_closed'
  );

  // Sound alarm trigger tracker to prevent multiple alarms for the same overdue record
  const alarmedRecordsRef = React.useRef<Set<string>>(new Set());

  // Alarm & status check for overdue students every second
  useEffect(() => {
    activeRecords.forEach((rec) => {
      const remaining = calculateRemainingSeconds(rec.due_at);
      if (remaining === 0) {
        if (!alarmedRecordsRef.current.has(rec.id)) {
          alarmedRecordsRef.current.add(rec.id);
          soundEffects.playAlarmSound();
          const student = students.find((s) => s.nis === rec.student_id);
          const studentName = student?.name || 'Siswa';
          speak(`Perhatian! ${studentName} dari kelas ${rec.class_id} telah melebihi batas waktu izin keluar kelas.`);
        }
      }
    });
  }, [currentServerTime, activeRecords, students, speak]);

  // Autocomplete search suggestions (Fuzzy name search)
  const filteredStudents = searchTerm.trim()
    ? students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.nis.includes(searchTerm) ||
            s.class_id.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 6)
    : [];

  // Update default duration when permission type changes
  const handleTypeChange = (type: OutOfClassType) => {
    setPermissionType(type);
    if (type === 'BAK') {
      setCustomDuration(settings.out_of_class_bak_duration || 5);
    } else if (type === 'BAB') {
      setCustomDuration(settings.out_of_class_bab_duration || 10);
    } else {
      setCustomDuration(settings.out_of_class_other_duration || 2);
    }
  };

  // Submit start out of class
  const handleStartPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const res = await startOutOfClass(selectedStudent.nis, permissionType, customDuration);
    setIsSubmitting(false);

    if (res.success && res.record) {
      const msg = `${selectedStudent.name}, izin ${permissionType} selama ${customDuration} menit dimulai.`;
      speak(msg);
      showToast(msg, 'success');

      // Clear search and selection ready for next student
      setSelectedStudent(null);
      setSearchTerm('');
    } else {
      setErrorMessage(res.error || 'Gagal memulai izin keluar.');
      speak(res.error || 'Izin keluar kelas tidak dapat diberikan.');
    }
  };

  // Confirm return by clicking big checkmark icon
  const handleConfirmReturn = async (recordId: string) => {
    const rec = outOfClass.find((o) => o.id === recordId);
    const student = students.find((s) => s.nis === rec?.student_id);
    const studentName = student?.name || 'Siswa';

    const res = await confirmOutOfClassReturn(recordId, 'click');
    if (res.success && res.record) {
      if (res.record.late_return_minutes > 0) {
        showToast(
          `${studentName} kembali ke kelas terlambat ${res.record.late_return_minutes} menit.`,
          'info'
        );
      } else {
        showToast(`${studentName} telah kembali ke kelas tepat waktu.`, 'success');
      }
    }
  };

  // Quota calculation per class
  const maxPerClass = settings.out_of_class_max_per_class || 2;
  const classQuotaStats = classes.map((cls) => {
    const activeInClass = activeRecords.filter((r) => r.class_id === cls.id).length;
    return {
      class: cls,
      activeCount: activeInClass,
      isFull: activeInClass >= maxPerClass,
    };
  });

  // Top statistics for summary
  const mostFrequentLeavers = React.useMemo(() => {
    const counts: Record<string, number> = {};
    todayRecords.forEach((r) => {
      counts[r.student_id] = (counts[r.student_id] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([nis, count]) => ({
        student: students.find((s) => s.nis === nis),
        count,
      }))
      .filter((x) => x.student)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [todayRecords, students]);

  const mostLateReturners = React.useMemo(() => {
    const lateMap: Record<string, { count: number; totalMinutes: number }> = {};
    todayRecords.forEach((r) => {
      if (r.late_return_minutes > 0) {
        if (!lateMap[r.student_id]) lateMap[r.student_id] = { count: 0, totalMinutes: 0 };
        lateMap[r.student_id].count += 1;
        lateMap[r.student_id].totalMinutes += r.late_return_minutes;
      }
    });
    return Object.entries(lateMap)
      .map(([nis, data]) => ({
        student: students.find((s) => s.nis === nis),
        ...data,
      }))
      .filter((x) => x.student)
      .sort((a, b) => b.totalMinutes - a.totalMinutes)
      .slice(0, 5);
  }, [todayRecords, students]);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Quota indicators */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <DoorOpen className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              Izin Keluar Kelas Berkuota
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Input manual pencarian nama (tanpa scan). Maks. {maxPerClass} siswa per kelas keluar bersamaan & maks. {settings.out_of_class_max_per_student_daily || 2}x izin/hari.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Sedang di Luar: <span className="font-bold text-slate-900 dark:text-white">{activeRecords.length} Siswa</span>
            </span>
          </div>
        </div>

        {/* Quota per class indicators (Bagian 5) */}
        <div className="pt-4">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Sisa Kuota Izin per Kelas Hari Ini (Batas: {maxPerClass} Siswa Keluar Bersamaan):
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {classQuotaStats.map(({ class: cls, activeCount, isFull }) => (
              <div
                key={cls.id}
                className={`p-2.5 rounded border text-xs flex items-center justify-between ${
                  isFull
                    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
                    : activeCount > 0
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div>
                  <span className="font-semibold block">{cls.name}</span>
                  <span className="text-[10px] text-slate-400">{cls.major}</span>
                </div>
                <div className="text-right">
                  <span className="font-bold font-mono text-sm">
                    {activeCount}/{maxPerClass}
                  </span>
                  <span className="block text-[10px]">
                    {isFull ? 'Penuh' : `Sisa ${maxPerClass - activeCount}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Input Form Section (Bagian 5 Alur Izin Keluar) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          1. Mulai Izin Keluar Siswa
        </h2>

        {errorMessage && (
          <div className="mb-4 p-3 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>{errorMessage}</p>
          </div>
        )}

        <form onSubmit={handleStartPermission} className="space-y-4">
          {/* Autocomplete Search input */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cari Nama Siswa (Ketik sebagian nama atau NIS)
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSelectedStudent(null);
                  setErrorMessage(null);
                }}
                placeholder="Ketik nama siswa..."
                className="w-full px-3.5 py-2.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            </div>

            {/* Suggestions list */}
            {filteredStudents.length > 0 && !selectedStudent && (
              <div className="absolute z-20 left-0 right-0 mt-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700 text-xs">
                {filteredStudents.map((s) => (
                  <div
                    key={s.nis}
                    onClick={() => {
                      setSelectedStudent(s);
                      setSearchTerm(`${s.name} (${s.class_id})`);
                    }}
                    className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-[10px]">
                        {s.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">Kelas {s.class_id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Selected student badge */}
          {selectedStudent && (
            <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold text-xs">
                  {selectedStudent.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{selectedStudent.name}</p>
                  <p className="text-[10px] text-slate-500">Kelas {selectedStudent.class_id} • NIS: {selectedStudent.nis}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedStudent(null);
                  setSearchTerm('');
                }}
                className="text-slate-400 hover:text-slate-600 text-xs"
              >
                Ganti Siswa
              </button>
            </div>
          )}

          {/* Permission Type Selection Buttons (Bagian 5 Poin 82) */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Pilih Jenis Izin & Durasi
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('BAK')}
                className={`p-3 rounded border text-xs text-left transition-colors ${
                  permissionType === 'BAK'
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-bold block">1. BAK (Buang Air Kecil)</span>
                <span className="text-[11px] opacity-80">{settings.out_of_class_bak_duration || 5} Menit</span>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('BAB')}
                className={`p-3 rounded border text-xs text-left transition-colors ${
                  permissionType === 'BAB'
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-bold block">2. BAB (Buang Air Besar)</span>
                <span className="text-[11px] opacity-80">{settings.out_of_class_bab_duration || 10} Menit</span>
              </button>

              <button
                type="button"
                onClick={() => handleTypeChange('Keperluan Lain')}
                className={`p-3 rounded border text-xs text-left transition-colors ${
                  permissionType === 'Keperluan Lain'
                    ? 'border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-900'
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="font-bold block">3. Keperluan Lain</span>
                <span className="text-[11px] opacity-80">{settings.out_of_class_other_duration || 2} Menit</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedStudent || isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded font-semibold text-xs text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {isSubmitting ? 'Memeriksa Kuota...' : 'Mulai Izin Keluar'}
          </button>
        </form>
      </div>

      {/* PANEL SEDANG KELUAR (REAL-TIME COUNTDOWN & CHECKMARK RETURN) - Bagian 5 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              2. Panel Sedang Keluar ({activeRecords.length} Siswa)
            </h2>
          </div>
          <span className="text-[11px] text-slate-400">
            Klik ikon centang (✓) saat siswa kembali ke kelas
          </span>
        </div>

        {activeRecords.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs">
            Saat ini tidak ada siswa yang sedang berada di luar kelas.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 mt-4">
            {activeRecords.map((rec) => {
              const student = students.find((s) => s.nis === rec.student_id);
              const remainingSec = calculateRemainingSeconds(rec.due_at);
              const isOverdue = remainingSec === 0;
              const overdueSec = isOverdue ? calculateOverdueSeconds(rec.due_at) : 0;

              return (
                <div
                  key={rec.id}
                  className={`p-4 rounded-lg border-2 transition-all flex flex-col justify-between ${
                    isOverdue
                      ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-500 animate-pulse'
                      : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center font-bold text-slate-800 dark:text-slate-200 text-xs overflow-hidden shrink-0">
                        {student?.photo_url ? (
                          <img src={student.photo_url} alt={student.name} className="w-full h-full object-cover" />
                        ) : (
                          student?.name.slice(0, 2).toUpperCase() || '!'
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white text-xs truncate">
                          {student?.name || rec.student_id}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Kelas {rec.class_id} • {rec.type} ({rec.duration_minutes}m)
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Keluar: {new Date(rec.started_at).toLocaleTimeString('id-ID')}
                        </p>
                      </div>
                    </div>

                    {/* BIG CHECKMARK ICON TO CONFIRM RETURN (Bagian 5) */}
                    <button
                      type="button"
                      onClick={() => handleConfirmReturn(rec.id)}
                      title="Konfirmasi Siswa Kembali"
                      className="p-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow hover:scale-105 active:scale-95 transition-all shrink-0"
                    >
                      <Check className="w-5 h-5 stroke-[2.5]" />
                    </button>
                  </div>

                  {/* Countdown Timer or Overdue Live Counter */}
                  <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs">
                    <div>
                      {isOverdue ? (
                        <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-semibold">
                          <AlertTriangle className="w-4 h-4 animate-bounce" />
                          <span>Melebihi Waktu</span>
                        </div>
                      ) : (
                        <span className="text-slate-500 dark:text-slate-400">Sisa Waktu:</span>
                      )}
                    </div>

                    <div className="font-mono text-base font-bold">
                      {isOverdue ? (
                        <span className="text-rose-600 dark:text-rose-400 animate-pulse">
                          +{formatDuration(overdueSec)}
                        </span>
                      ) : (
                        <span className="text-slate-900 dark:text-white">
                          {formatDuration(remainingSec)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* History and Summary Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Returned History (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            Riwayat Izin Keluar Hari Ini ({todayRecords.length} kali)
          </h2>

          {todayRecords.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Belum ada riwayat izin hari ini.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                    <th className="py-2">Nama Siswa</th>
                    <th className="py-2">Kelas</th>
                    <th className="py-2">Jenis</th>
                    <th className="py-2">Keluar - Kembali</th>
                    <th className="py-2">Keterlambatan</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {todayRecords.map((rec) => {
                    const student = students.find((s) => s.nis === rec.student_id);
                    return (
                      <tr key={rec.id}>
                        <td className="py-2.5 font-medium text-slate-900 dark:text-white">
                          {student?.name || rec.student_id}
                        </td>
                        <td className="py-2.5 text-slate-500">{rec.class_id}</td>
                        <td className="py-2.5">{rec.type}</td>
                        <td className="py-2.5 font-mono text-[11px] text-slate-500">
                          {new Date(rec.started_at).toLocaleTimeString('id-ID')}
                          {' - '}
                          {rec.returned_at ? new Date(rec.returned_at).toLocaleTimeString('id-ID') : 'Belum'}
                        </td>
                        <td className="py-2.5">
                          {rec.late_return_minutes > 0 ? (
                            <span className="font-semibold text-rose-600">
                              +{rec.late_return_minutes} menit
                            </span>
                          ) : rec.returned_at ? (
                            <span className="text-emerald-600 font-medium">Tepat Waktu</span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              rec.status === 'returned'
                                ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                : rec.status === 'auto_closed'
                                ? 'bg-zinc-100 text-zinc-600'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                            }`}
                          >
                            {rec.status === 'returned' ? 'Kembali' : rec.status === 'auto_closed' ? 'Auto Closed' : 'Di Luar'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Top Out-of-Class Statistics (1 col) */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-slate-500" /> Siswa Paling Sering Keluar
            </h3>
            {mostFrequentLeavers.length === 0 ? (
              <p className="text-slate-400 py-2">Belum ada data.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {mostFrequentLeavers.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.student?.name}</span>
                      <span className="text-[10px] text-slate-400 block">{item.student?.class_id}</span>
                    </div>
                    <span className="font-bold text-slate-900 dark:text-white">{item.count}x izin</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-rose-700 dark:text-rose-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> Siswa Paling Sering Terlambat Kembali
            </h3>
            {mostLateReturners.length === 0 ? (
              <p className="text-slate-400 py-2">Tidak ada siswa terlambat kembali.</p>
            ) : (
              <div className="space-y-2 mt-2">
                {mostLateReturners.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <div>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.student?.name}</span>
                      <span className="text-[10px] text-slate-400 block">{item.student?.class_id} • {item.count}x telat</span>
                    </div>
                    <span className="font-bold text-rose-600">+{item.totalMinutes} menit</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
