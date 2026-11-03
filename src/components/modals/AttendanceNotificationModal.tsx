import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { Student, AttendanceRecord, AttendanceSession } from '../../types/index.js';

interface AttendanceNotificationModalProps {
  student: Student | null;
  record: AttendanceRecord | null;
  session: AttendanceSession | null;
  customMessage?: string;
  isError?: boolean;
  onClose: () => void;
}

export const AttendanceNotificationModal: React.FC<AttendanceNotificationModalProps> = ({
  student,
  record,
  session,
  customMessage,
  isError,
  onClose,
}) => {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = 4000;
    const interval = 50;
    const step = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onClose();
          return 0;
        }
        return prev - step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onClose]);

  if (!student && !customMessage) return null;

  const status = record?.status || (isError ? 'Gagal' : 'Hadir');
  const isLate = status === 'Terlambat';

  const getStatusBadge = () => {
    switch (status) {
      case 'Hadir':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800',
          dot: 'bg-emerald-500',
          label: 'Hadir Tepat Waktu',
          border: 'border-emerald-500',
        };
      case 'Terlambat':
        return {
          bg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800',
          dot: 'bg-amber-500',
          label: `Terlambat (+${record?.late_minutes || 0} menit)`,
          border: 'border-amber-500',
        };
      case 'Izin':
        return {
          bg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800',
          dot: 'bg-blue-500',
          label: 'Izin',
          border: 'border-blue-500',
        };
      case 'Sakit':
        return {
          bg: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-400 dark:border-yellow-800',
          dot: 'bg-yellow-500',
          label: 'Sakit',
          border: 'border-yellow-500',
        };
      default:
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800',
          dot: 'bg-rose-500',
          label: isError ? 'Gagal / Tidak Terdaftar' : status,
          border: 'border-rose-500',
        };
    }
  };

  const badge = getStatusBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-150">
      <div
        className={`relative w-full max-w-md bg-white dark:bg-slate-900 border-2 ${badge.border} rounded-lg shadow-xl overflow-hidden`}
      >
        {/* Progress bar */}
        <div
          className="h-1 bg-slate-900 dark:bg-slate-100 transition-all ease-linear"
          style={{ width: `${progress}%` }}
        />

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="p-6 text-center">
          {/* Avatar or Photo */}
          <div className="mx-auto w-20 h-20 rounded-full border-2 border-slate-200 dark:border-slate-700 overflow-hidden flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xl font-bold mb-4 shadow-sm">
            {student?.photo_url ? (
              <img
                src={student.photo_url}
                alt={student.name}
                className="w-full h-full object-cover"
              />
            ) : (
              student?.name
                ?.split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('') || '!'
            )}
          </div>

          {/* Student Name & Class */}
          <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
            {student?.name || 'Pemberitahuan Sistem'}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {student ? `Kelas ${student.class_id} • NIS: ${student.nis}` : ''}
          </p>

          {/* Status Badge */}
          <div className="my-3 inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold">
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            <span className={badge.bg.split(' ')[1]}>{badge.label}</span>
          </div>

          {/* Spoken Message Box */}
          <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300">
            {customMessage || (
              isLate
                ? `Halo, ${student?.name}. Kamu tercatat terlambat ${record?.late_minutes || 0} menit di sesi ${session?.name || 'presensi'}. Silakan segera masuk kelas.`
                : `Selamat pagi, ${student?.name}. Kamu hadir tepat waktu di sesi ${session?.name || 'presensi'}.`
            )}
          </div>

          {/* Timestamp */}
          <div className="mt-3 text-[11px] text-slate-400">
            {record?.timestamp
              ? new Date(record.timestamp).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : new Date().toLocaleTimeString('id-ID')}
          </div>
        </div>
      </div>
    </div>
  );
};
