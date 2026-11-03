import React, { useState } from 'react';
import { X, Calendar, AlertTriangle, DoorOpen, Award, Mail, User, ShieldCheck } from 'lucide-react';
import { Student } from '../../types/index.js';
import { useApp } from '../../context/AppContext.js';

interface StudentProfileModalProps {
  student: Student | null;
  onClose: () => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({ student, onClose }) => {
  const { attendance, outOfClass, violations, settings } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'attendance' | 'out_of_class' | 'violations'>('overview');

  if (!student) return null;

  // Student specific records
  const studentAttendance = attendance.filter((a) => a.student_id === student.nis);
  const studentOoc = outOfClass.filter((o) => o.student_id === student.nis);
  const studentViolations = violations.filter((v) => v.student_id === student.nis);

  const hadirCount = studentAttendance.filter((a) => a.status === 'Hadir').length;
  const terlambatCount = studentAttendance.filter((a) => a.status === 'Terlambat').length;
  const totalLateMinutes = studentAttendance.reduce((acc, curr) => acc + (curr.late_minutes || 0), 0);
  const izinCount = studentAttendance.filter((a) => a.status === 'Izin').length;
  const sakitCount = studentAttendance.filter((a) => a.status === 'Sakit').length;
  const alphaCount = studentAttendance.filter((a) => a.status === 'Alpha').length;

  const totalLateReturnMinutes = studentOoc.reduce((acc, curr) => acc + (curr.late_return_minutes || 0), 0);

  // Violations vs Positive Points
  const penaltyPoints = studentViolations
    .filter((v) => v.category !== 'prestasi')
    .reduce((acc, curr) => acc + curr.points, 0);

  const achievementPoints = studentViolations
    .filter((v) => v.category === 'prestasi')
    .reduce((acc, curr) => acc + curr.points, 0);

  // Discipline formula score
  // Bagian 7: skor = 100 - poin pelanggaran - (keterlambatan x bobot) - (alpha x bobot) - (menit terlambat kembali x bobot, opsional) + bonus
  const lateWeight = settings.discipline_late_weight ?? 2;
  const alphaWeight = settings.discipline_alpha_weight ?? 10;
  const lateReturnWeight = settings.discipline_late_return_weight ?? 1;
  const fullAttendanceBonus = (alphaCount === 0 && terlambatCount === 0 && hadirCount >= 5) ? (settings.discipline_full_attendance_bonus ?? 5) : 0;

  const disciplineScore = Math.max(
    0,
    Math.min(
      100,
      100 -
        penaltyPoints +
        achievementPoints -
        terlambatCount * lateWeight -
        alphaCount * alphaWeight -
        totalLateReturnMinutes * lateReturnWeight +
        fullAttendanceBonus
    )
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-800 dark:text-slate-200 font-bold overflow-hidden">
              {student.photo_url ? (
                <img src={student.photo_url} alt={student.name} className="w-full h-full object-cover" />
              ) : (
                student.name.slice(0, 2).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {student.name}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kelas {student.class_id} • NIS: {student.nis} • NISN: {student.nisn || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Discipline Score badge */}
            <div className="text-right">
              <span className="text-[10px] text-slate-400 block uppercase font-medium tracking-wide">
                Skor Disiplin
              </span>
              <span
                className={`text-lg font-mono font-bold ${
                  disciplineScore >= 85
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : disciplineScore >= 70
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {disciplineScore}
                <span className="text-xs text-slate-400">/100</span>
              </span>
            </div>

            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-4 gap-4 text-xs font-medium">
          {[
            { id: 'overview', label: 'Ringkasan' },
            { id: 'attendance', label: `Presensi (${studentAttendance.length})` },
            { id: 'out_of_class', label: `Izin Keluar (${studentOoc.length})` },
            { id: 'violations', label: `Pelanggaran (${studentViolations.length})` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`py-2.5 border-b-2 transition-colors ${
                activeTab === t.id
                  ? 'border-slate-900 dark:border-white text-slate-900 dark:text-white font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'overview' && (
            <div className="space-y-4 text-xs">
              {/* Quick stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-emerald-700 dark:text-emerald-400 block text-[11px]">Hadir</span>
                  <span className="text-base font-bold text-emerald-900 dark:text-emerald-200">{hadirCount}x</span>
                </div>
                <div className="p-2.5 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <span className="text-amber-700 dark:text-amber-400 block text-[11px]">Terlambat</span>
                  <span className="text-base font-bold text-amber-900 dark:text-amber-200">{terlambatCount}x ({totalLateMinutes}m)</span>
                </div>
                <div className="p-2.5 rounded bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                  <span className="text-rose-700 dark:text-rose-400 block text-[11px]">Alpha / Absen</span>
                  <span className="text-base font-bold text-rose-900 dark:text-rose-200">{alphaCount}x</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <span className="text-slate-600 dark:text-slate-400 block text-[11px]">Poin Pelanggaran</span>
                  <span className="text-base font-bold text-slate-900 dark:text-white">{penaltyPoints} Poin</span>
                </div>
              </div>

              {/* Identity Details */}
              <div className="p-3 rounded border border-slate-200 dark:border-slate-700 space-y-2">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" /> Informasi Data Siswa
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                  <div>Jenis Kelamin: <span className="font-medium text-slate-900 dark:text-white">{student.gender === 'L' ? 'Laki-laki' : 'Perempuan'}</span></div>
                  <div>UID Kartu RFID: <span className="font-mono text-slate-900 dark:text-white">{student.rfid_uid}</span></div>
                  <div>Orang Tua / Wali: <span className="font-medium text-slate-900 dark:text-white">{student.parent_name || '-'}</span></div>
                  <div>Email Orang Tua: <span className="font-medium text-slate-900 dark:text-white">{student.parent_email || '-'}</span></div>
                </div>
              </div>

              {/* Status Peringatan (SP) */}
              <div className="p-3 rounded border border-slate-200 dark:border-slate-700">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-500" /> Status Kedisiplinan & Peringatan
                </h4>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                    penaltyPoints >= 75
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : penaltyPoints >= 50
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : penaltyPoints >= 25
                      ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}>
                    {penaltyPoints >= 75
                      ? 'SP 3 / Panggilan Orang Tua'
                      : penaltyPoints >= 50
                      ? 'SP 2 (Surat Peringatan II)'
                      : penaltyPoints >= 25
                      ? 'SP 1 (Surat Peringatan I)'
                      : 'Baik / Bebas Pelanggaran'}
                  </span>
                  {achievementPoints > 0 && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      +{achievementPoints} Poin Prestasi
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="text-xs">
              {studentAttendance.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Belum ada catatan presensi untuk siswa ini.</p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2">Tanggal</th>
                      <th className="py-2">Jam</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Metode</th>
                      <th className="py-2">Catatan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {studentAttendance.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2">{a.date}</td>
                        <td className="py-2 font-mono">{new Date(a.timestamp).toLocaleTimeString('id-ID')}</td>
                        <td className="py-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            a.status === 'Hadir' ? 'bg-emerald-100 text-emerald-800' :
                            a.status === 'Terlambat' ? 'bg-amber-100 text-amber-800' :
                            a.status === 'Alpha' ? 'bg-rose-100 text-rose-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {a.status} {a.late_minutes > 0 ? `(+${a.late_minutes}m)` : ''}
                          </span>
                        </td>
                        <td className="py-2 uppercase text-[10px] text-slate-400">{a.method}</td>
                        <td className="py-2 text-slate-500">{a.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'out_of_class' && (
            <div className="text-xs">
              {studentOoc.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Belum ada riwayat izin keluar kelas.</p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                      <th className="py-2">Mulai</th>
                      <th className="py-2">Jenis</th>
                      <th className="py-2">Durasi</th>
                      <th className="py-2">Jam Kembali</th>
                      <th className="py-2">Keterlambatan</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {studentOoc.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2 font-mono">{new Date(o.started_at).toLocaleTimeString('id-ID')}</td>
                        <td className="py-2 font-medium">{o.type}</td>
                        <td className="py-2">{o.duration_minutes} menit</td>
                        <td className="py-2 font-mono">{o.returned_at ? new Date(o.returned_at).toLocaleTimeString('id-ID') : '-'}</td>
                        <td className="py-2">
                          {o.late_return_minutes > 0 ? (
                            <span className="text-rose-600 font-semibold">+{o.late_return_minutes} menit</span>
                          ) : (
                            <span className="text-slate-400">Tepat Waktu</span>
                          )}
                        </td>
                        <td className="py-2 capitalize">{o.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === 'violations' && (
            <div className="text-xs space-y-3">
              {studentViolations.length === 0 ? (
                <p className="text-slate-400 py-4 text-center">Tidak ada catatan pelanggaran.</p>
              ) : (
                studentViolations.map((v) => (
                  <div key={v.id} className="p-3 rounded border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                          v.category === 'prestasi' ? 'bg-emerald-100 text-emerald-800' :
                          v.category === 'berat' ? 'bg-rose-100 text-rose-800' :
                          v.category === 'sedang' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-800'
                        }`}>
                          {v.category}
                        </span>
                        <span className="font-semibold text-slate-900 dark:text-white">{v.type_name}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">{v.notes || 'Tanpa catatan khusus'}</p>
                      <p className="text-[10px] text-slate-400">
                        Dicatat oleh: {v.recorded_by} • {new Date(v.recorded_at).toLocaleString('id-ID')}
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`font-bold font-mono text-sm ${v.category === 'prestasi' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {v.category === 'prestasi' ? `+${v.points}` : `-${v.points}`} Poin
                      </span>
                      {v.evidence_photo_url && (
                        <a
                          href={v.evidence_photo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-600 hover:underline"
                        >
                          Lihat Bukti Foto
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
