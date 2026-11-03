import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  Users,
  Award,
  AlertTriangle,
  FileSpreadsheet,
  Printer,
  FileText,
  Lock,
  Calendar,
  Clock,
  DoorOpen,
} from 'lucide-react';
import {
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
import { exportToExcel } from '../utils/excel.js';
import { Student } from '../types/index.js';

export const StudentAffairsView: React.FC = () => {
  const {
    students,
    classes,
    attendance,
    outOfClass,
    violations,
    settings,
    lockCurrentMenu,
    showToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'students' | 'rankings' | 'violations' | 'comparison' | 'official_report'>('students');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStudentForLetter, setSelectedStudentForLetter] = useState<Student | null>(null);
  const [spLetterType, setSpLetterType] = useState<'SP1' | 'SP2' | 'SP3'>('SP1');
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (filterClass !== 'all' && s.class_id !== filterClass) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return s.name.toLowerCase().includes(q) || s.nis.includes(q) || s.class_id.toLowerCase().includes(q);
      }
      return true;
    });
  }, [students, filterClass, searchQuery]);

  // Overall Rankings
  const rankings = useMemo(() => {
    const lateW = settings.discipline_late_weight ?? 2;
    const alphaW = settings.discipline_alpha_weight ?? 10;
    const lateRetW = settings.discipline_late_return_weight ?? 1;

    const list = students.map((s) => {
      const sAtt = attendance.filter((a) => a.student_id === s.nis);
      const sOoc = outOfClass.filter((o) => o.student_id === s.nis);
      const sVio = violations.filter((v) => v.student_id === s.nis);

      const lates = sAtt.filter((a) => a.status === 'Terlambat').length;
      const totalLateMins = sAtt.reduce((acc, curr) => acc + (curr.late_minutes || 0), 0);
      const alphas = sAtt.filter((a) => a.status === 'Alpha').length;
      const presents = sAtt.filter((a) => a.status === 'Hadir').length;

      const penaltyPts = sVio
        .filter((v) => v.category !== 'prestasi')
        .reduce((acc, curr) => acc + curr.points, 0);

      const achievementPts = sVio
        .filter((v) => v.category === 'prestasi')
        .reduce((acc, curr) => acc + curr.points, 0);

      const lateRetMins = sOoc.reduce((acc, curr) => acc + (curr.late_return_minutes || 0), 0);

      const bonus = alphas === 0 && lates === 0 && presents >= 5 ? (settings.discipline_full_attendance_bonus ?? 5) : 0;

      const score = Math.max(
        0,
        Math.min(
          100,
          100 -
            penaltyPts +
            achievementPts -
            lates * lateW -
            alphas * alphaW -
            lateRetMins * lateRetW +
            bonus
        )
      );

      return {
        student: s,
        lates,
        totalLateMins,
        alphas,
        presents,
        penaltyPts,
        achievementPts,
        lateRetMins,
        score,
      };
    });

    return {
      topLate: [...list].sort((a, b) => b.totalLateMins - a.totalLateMins).slice(0, 10),
      topLateReturn: [...list].sort((a, b) => b.lateRetMins - a.lateRetMins).slice(0, 10),
      topDiscipline: [...list].sort((a, b) => b.score - a.score).slice(0, 10),
      needWarningLetter: list.filter((x) => x.penaltyPts >= 25).sort((a, b) => b.penaltyPts - a.penaltyPts),
    };
  }, [students, attendance, outOfClass, violations, settings]);

  // Comparison across classes
  const comparisonData = useMemo(() => {
    return classes.map((c) => {
      const cAtt = attendance.filter((a) => {
        const s = students.find((std) => std.nis === a.student_id);
        return s?.class_id === c.id;
      });
      const cVio = violations.filter((v) => v.class_id === c.id && v.category !== 'prestasi');
      const totalPoints = cVio.reduce((acc, curr) => acc + curr.points, 0);

      return {
        name: c.name,
        Hadir: cAtt.filter((a) => a.status === 'Hadir').length,
        Terlambat: cAtt.filter((a) => a.status === 'Terlambat').length,
        Alpha: cAtt.filter((a) => a.status === 'Alpha').length,
        PoinPelanggaran: totalPoints,
      };
    });
  }, [classes, attendance, violations, students]);

  const handleExportFullExcel = () => {
    const data = students.map((s) => {
      const sAtt = attendance.filter((a) => a.student_id === s.nis);
      const sVio = violations.filter((v) => v.student_id === s.nis && v.category !== 'prestasi');
      const pts = sVio.reduce((acc, curr) => acc + curr.points, 0);

      return {
        NIS: s.nis,
        Nama: s.name,
        Kelas: s.class_id,
        Gender: s.gender,
        Hadir: sAtt.filter((a) => a.status === 'Hadir').length,
        Terlambat: sAtt.filter((a) => a.status === 'Terlambat').length,
        Alpha: sAtt.filter((a) => a.status === 'Alpha').length,
        PoinPelanggaran: pts,
        OrangTua: s.parent_name || '-',
        EmailOrangTua: s.parent_email || '-',
      };
    });
    exportToExcel(data, `laporan_kesiswaan_seluruh_sekolah_${new Date().toISOString().split('T')[0]}`);
    showToast('Laporan kesiswaan berhasil diekspor ke Excel.', 'success');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                Portal Kesiswaan & Tata Tertib Sekolah
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pengawasan kedisiplinan tingkat sekolah, penerbitan surat peringatan (SP), dan laporan resmi
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportFullExcel}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Ekspor Rekap</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Laporan</span>
            </button>
            <button
              type="button"
              onClick={lockCurrentMenu}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-semibold text-xs transition-colors shadow-xs"
              title="Kunci Akses Kesiswaan (Wajib Masukkan Password Kembali)"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci & Keluar</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex overflow-x-auto gap-2 pt-4 text-xs font-medium">
          {[
            ['students', `1. Seluruh Siswa (${students.length})`],
            ['rankings', '2. Ranking Kedisiplinan'],
            ['violations', `3. Surat Peringatan / SP (${rankings.needWarningLetter.length})`],
            ['comparison', '4. Perbandingan Antar Kelas'],
            ['official_report', '5. Cetak Laporan Resmi'],
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

      {/* TAB 1: REKAP PER SISWA SELURUH SEKOLAH */}
      {activeTab === 'students' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <h2 className="font-semibold text-slate-900 dark:text-white">
              Data Seluruh Siswa Sekolah ({filteredStudents.length} siswa ditampilkan)
            </h2>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="all">Semua Kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Cari nama / NIS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="overflow-x-auto text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5">NIS</th>
                  <th className="py-2.5">Nama Siswa</th>
                  <th className="py-2.5">Kelas</th>
                  <th className="py-2.5">Orang Tua / Wali</th>
                  <th className="py-2.5">Email Notifikasi</th>
                  <th className="py-2.5">Status Peringatan</th>
                  <th className="py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStudents.map((s) => {
                  const sVio = violations.filter((v) => v.student_id === s.nis && v.category !== 'prestasi');
                  const pts = sVio.reduce((acc, curr) => acc + curr.points, 0);

                  return (
                    <tr key={s.nis} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 font-mono text-[11px] text-slate-400">{s.nis}</td>
                      <td
                        onClick={() => setProfileStudent(s)}
                        className="py-2.5 font-medium text-slate-900 dark:text-white cursor-pointer hover:underline"
                      >
                        {s.name}
                      </td>
                      <td className="py-2.5 text-slate-500">{s.class_id}</td>
                      <td className="py-2.5 text-slate-600 dark:text-slate-300">{s.parent_name || '-'}</td>
                      <td className="py-2.5 font-mono text-[11px] text-slate-400">{s.parent_email || '-'}</td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            pts >= 75
                              ? 'bg-rose-100 text-rose-800 font-bold'
                              : pts >= 50
                              ? 'bg-amber-100 text-amber-800'
                              : pts >= 25
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {pts >= 75 ? `SP 3 (${pts} pts)` : pts >= 50 ? `SP 2 (${pts} pts)` : pts >= 25 ? `SP 1 (${pts} pts)` : `Bebas (${pts} pts)`}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => setProfileStudent(s)}
                          className="text-blue-600 hover:underline"
                        >
                          Profil
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: RANKINGS */}
      {activeTab === 'rankings' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-amber-700 dark:text-amber-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> Top 10 Terlambat Sekolah
            </h3>
            {rankings.topLate.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">{item.student.name}</span>
                  <span className="text-[10px] text-slate-400 block">Kelas {item.student.class_id}</span>
                </div>
                <span className="font-bold text-amber-600">+{item.totalLateMins}m ({item.lates}x)</span>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-rose-700 dark:text-rose-400 mb-3 flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4" /> Top 10 Telat Kembali Kelas
            </h3>
            {rankings.topLateReturn.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">{item.student.name}</span>
                  <span className="text-[10px] text-slate-400 block">Kelas {item.student.class_id}</span>
                </div>
                <span className="font-bold text-rose-600">+{item.lateRetMins} menit</span>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4" /> Top 10 Disiplin Sekolah
            </h3>
            {rankings.topDiscipline.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                <div>
                  <span className="font-medium text-slate-900 dark:text-white">{item.student.name}</span>
                  <span className="text-[10px] text-slate-400 block">Kelas {item.student.class_id}</span>
                </div>
                <span className="font-bold text-emerald-600">{item.score} Skor</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SURAT PERINGATAN (SP) MANAGER */}
      {activeTab === 'violations' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Kelola Surat Peringatan (Siswa Melewati Ambang Poin)
              </h2>
              <p className="text-xs text-slate-500">Ambang: 25 poin = SP1, 50 poin = SP2, 75 poin = SP3 / Panggilan Orang Tua</p>
            </div>
          </div>

          {rankings.needWarningLetter.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              Tidak ada siswa yang mencapai ambang batas surat peringatan saat ini.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {rankings.needWarningLetter.map((item) => (
                <div key={item.student.nis} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 dark:text-white">{item.student.name}</span>
                      <span className="text-slate-400">Kelas {item.student.class_id}</span>
                      <span className="font-bold font-mono text-rose-600">({item.penaltyPts} Poin)</span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Orang Tua: {item.student.parent_name} • Email: {item.student.parent_email}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedStudentForLetter(item.student);
                        setSpLetterType(item.penaltyPts >= 75 ? 'SP3' : item.penaltyPts >= 50 ? 'SP2' : 'SP1');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Buat Surat {item.penaltyPts >= 75 ? 'SP3' : item.penaltyPts >= 50 ? 'SP2' : 'SP1'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: PERBANDINGAN ANTAR KELAS GRAFIK */}
      {activeTab === 'comparison' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Grafik Perbandingan Kedisiplinan Antar Kelas
          </h2>
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
        </div>
      )}

      {/* TAB 5: LAPORAN RESMI CETAK PDF DENGAN KOP SEKOLAH */}
      {activeTab === 'official_report' && (
        <div className="bg-white text-slate-900 border border-slate-200 rounded-lg p-8 shadow-sm print:border-none print:shadow-none space-y-6">
          {/* KOP RESMI SEKOLAH */}
          <div className="text-center border-b-2 border-slate-900 pb-4">
            <h2 className="text-lg font-extrabold uppercase tracking-wide">
              {settings.school_name}
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              DIVISI KESISWAAN, KEDISIPLINAN & TATA TERTIB SISWA
            </p>
            <p className="text-[10px] text-slate-500">
              Laporan Resmi Rekapitulasi Presensi & Catatan Pelanggaran Siswa
            </p>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div>
              <p>Nomor Dokumen: <span className="font-mono font-semibold">DKB/KES/{new Date().getFullYear()}/04</span></p>
              <p>Perihal: Laporan Kedisiplinan & Presensi Berkala</p>
            </div>
            <div className="text-right">
              <p>Tanggal Cetak: {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <p>Petugas Kesiswaan: <span className="font-semibold">Tim Kesiswaan</span></p>
            </div>
          </div>

          <table className="w-full text-left text-xs border border-slate-300">
            <thead className="bg-slate-100 border-b border-slate-300">
              <tr>
                <th className="p-2 border-r border-slate-300">No</th>
                <th className="p-2 border-r border-slate-300">Kelas</th>
                <th className="p-2 border-r border-slate-300 text-center">Jumlah Siswa</th>
                <th className="p-2 border-r border-slate-300 text-center">Total Hadir</th>
                <th className="p-2 border-r border-slate-300 text-center">Total Terlambat</th>
                <th className="p-2 border-r border-slate-300 text-center">Total Alpha</th>
                <th className="p-2 text-center">Akumulasi Poin Pelanggaran</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {classes.map((cls, idx) => {
                const sCount = students.filter((s) => s.class_id === cls.id).length;
                const cAtt = attendance.filter((a) => {
                  const std = students.find((x) => x.nis === a.student_id);
                  return std?.class_id === cls.id;
                });
                const cVio = violations.filter((v) => v.class_id === cls.id && v.category !== 'prestasi');
                const pts = cVio.reduce((acc, curr) => acc + curr.points, 0);

                return (
                  <tr key={cls.id}>
                    <td className="p-2 border-r border-slate-300 text-center">{idx + 1}</td>
                    <td className="p-2 border-r border-slate-300 font-semibold">{cls.name}</td>
                    <td className="p-2 border-r border-slate-300 text-center">{sCount}</td>
                    <td className="p-2 border-r border-slate-300 text-center">{cAtt.filter((a) => a.status === 'Hadir').length}</td>
                    <td className="p-2 border-r border-slate-300 text-center">{cAtt.filter((a) => a.status === 'Terlambat').length}</td>
                    <td className="p-2 border-r border-slate-300 text-center">{cAtt.filter((a) => a.status === 'Alpha').length}</td>
                    <td className="p-2 text-center font-bold">{pts} Poin</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Tanda Tangan */}
          <div className="pt-8 flex justify-between text-xs text-center">
            <div>
              <p>Mengetahui,</p>
              <p className="font-semibold">Kepala Sekolah</p>
              <div className="h-16" />
              <p className="font-bold underline">(.......................................)</p>
            </div>
            <div>
              <p>Kota, {new Date().toLocaleDateString('id-ID')}</p>
              <p className="font-semibold">Koordinator Kesiswaan & Tatib</p>
              <div className="h-16" />
              <p className="font-bold underline">(.......................................)</p>
            </div>
          </div>
        </div>
      )}

      {/* POPUP PRINTABLE SURAT PERINGATAN MODAL */}
      {selectedStudentForLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-xl bg-white text-slate-900 border border-slate-300 rounded-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Kop */}
            <div className="text-center border-b-2 border-slate-900 pb-3 mb-4">
              <h2 className="text-base font-extrabold uppercase">{settings.school_name}</h2>
              <p className="text-[11px] text-slate-600">SURAT PERINGATAN KEDISIPLINAN SISWA</p>
            </div>

            <div className="space-y-3 text-xs leading-relaxed">
              <p className="font-bold text-center text-sm uppercase underline">
                SURAT PERINGATAN {spLetterType}
              </p>
              <p>Nomor: SP/{spLetterType}/{new Date().getFullYear()}/012</p>

              <p>
                Berdasarkan data catatan kedisiplinan dan tata tertib sekolah, dengan ini diterbitkan Surat Peringatan kepada:
              </p>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-1">
                <div>Nama Lengkap: <span className="font-bold">{selectedStudentForLetter.name}</span></div>
                <div>NIS / Kelas: <span className="font-semibold">{selectedStudentForLetter.nis} / {selectedStudentForLetter.class_id}</span></div>
                <div>Nama Orang Tua/Wali: <span className="font-semibold">{selectedStudentForLetter.parent_name || '-'}</span></div>
              </div>

              <p>
                Diterbitkan sehubungan dengan akumulasi catatan pelanggaran yang telah mencapai batas ketentuan. Diharapkan orang tua/wali siswa dapat mendampingi dan memberikan pembinaan lebih lanjut.
              </p>

              <div className="pt-6 flex justify-between text-xs text-center">
                <div>
                  <p>Orang Tua / Wali Siswa,</p>
                  <div className="h-12" />
                  <p>(..................................)</p>
                </div>
                <div>
                  <p>Koordinator Kesiswaan,</p>
                  <div className="h-12" />
                  <p>(..................................)</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedStudentForLetter(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-slate-900 text-white font-semibold text-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Surat Ini</span>
              </button>
            </div>
          </div>
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
