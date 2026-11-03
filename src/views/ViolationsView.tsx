import React, { useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Search,
  Award,
  Filter,
  FileSpreadsheet,
  Printer,
  Trash2,
  CheckCircle,
  Eye,
  X,
  Upload,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { CameraCaptureModal } from '../components/modals/CameraCaptureModal.js';
import { StudentProfileModal } from '../components/modals/StudentProfileModal.js';
import { exportToExcel } from '../utils/excel.js';
import { Student, ViolationType, ViolationRecord } from '../types/index.js';

export const ViolationsView: React.FC = () => {
  const {
    students,
    classes,
    violationTypes,
    violations,
    settings,
    recordViolation,
    deleteViolation,
    speak,
    showToast,
  } = useApp();

  // Input form state
  const [activeTab, setActiveTab] = useState<'input' | 'recap' | 'gallery'>('input');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(violationTypes[0]?.id || '');
  const [customPoints, setCustomPoints] = useState<number | ''>('');
  const [notes, setNotes] = useState('');
  const [location, setLocation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Evidence photo state
  const [evidenceBase64, setEvidenceBase64] = useState<string | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // Filter state for Recap tab
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Selected student drilldown modal
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Selected violation type object
  const currentType = violationTypes.find((t) => t.id === selectedTypeId) || violationTypes[0];

  // Autocomplete search suggestions (Fuzzy name search)
  const filteredStudents = searchTerm.trim()
    ? students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            s.nis.includes(searchTerm) ||
            s.rfid_uid.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .slice(0, 5)
    : [];

  const handleCapturePhoto = (base64: string, fileName: string) => {
    setEvidenceBase64(base64);
    setEvidenceFileName(fileName);
    showToast('Foto bukti berhasil diambil.', 'success');
  };

  const handleSaveViolation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent || !currentType || isSubmitting) return;

    setIsSubmitting(true);

    const pointsToRecord = customPoints !== '' ? Number(customPoints) : currentType.default_points;

    const res = await recordViolation({
      studentId: selectedStudent.nis,
      violationTypeId: currentType.id,
      customPoints: pointsToRecord,
      notes,
      location,
      evidenceBase64: evidenceBase64 || undefined,
      evidenceFileName: evidenceFileName || undefined,
    });

    setIsSubmitting(false);

    if (res.success && res.violation) {
      const isAchievement = currentType.category === 'prestasi';
      const msg = isAchievement
        ? `Prestasi ${selectedStudent.name} berhasil dicatat (+${pointsToRecord} poin).`
        : `Pelanggaran ${selectedStudent.name} berhasil dicatat (-${pointsToRecord} poin). Total akumulasi: ${res.studentTotalPoints} poin.`;

      speak(msg);
      showToast(msg, isAchievement ? 'success' : 'error');

      // Check warning threshold
      if (!isAchievement && res.studentTotalPoints && res.studentTotalPoints >= 25) {
        showToast(
          `Peringatan: Akumulasi poin ${selectedStudent.name} mencapai ${res.studentTotalPoints} poin (Melewati batas SP).`,
          'error'
        );
      }

      // Reset Form
      setSelectedStudent(null);
      setSearchTerm('');
      setNotes('');
      setLocation('');
      setCustomPoints('');
      setEvidenceBase64(null);
      setEvidenceFileName(null);
    } else {
      showToast(res.error || 'Gagal menyimpan catatan', 'error');
    }
  };

  // Filtered violations for Recap
  const filteredViolations = violations.filter((v) => {
    if (filterClass !== 'all' && v.class_id !== filterClass) return false;
    if (filterCategory !== 'all' && v.category !== filterCategory) return false;
    if (filterSearch.trim()) {
      const student = students.find((s) => s.nis === v.student_id);
      const sName = student?.name.toLowerCase() || '';
      const vName = v.type_name.toLowerCase();
      const q = filterSearch.toLowerCase();
      if (!sName.includes(q) && !vName.includes(q) && !v.student_id.includes(q)) {
        return false;
      }
    }
    return true;
  });

  const handleExportExcel = () => {
    const data = filteredViolations.map((v) => {
      const student = students.find((s) => s.nis === v.student_id);
      return {
        'ID Pelanggaran': v.id,
        'Tanggal': new Date(v.recorded_at).toLocaleDateString('id-ID'),
        'NIS': v.student_id,
        'Nama Siswa': student?.name || '-',
        'Kelas': v.class_id,
        'Kategori': v.category,
        'Jenis Pelanggaran': v.type_name,
        'Poin': v.points,
        'Lokasi': v.location || '-',
        'Catatan': v.notes || '-',
        'Pencatat': v.recorded_by,
      };
    });
    exportToExcel(data, `rekap_pelanggaran_${new Date().toISOString().split('T')[0]}`);
    showToast('Rekap pelanggaran berhasil diekspor ke Excel.', 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner & Tab Navigation */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-slate-700 dark:text-slate-300" />
              Pencatatan & Rekap Pelanggaran Siswa
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Catat pelanggaran tata tertib dan poin prestasi dengan bukti foto kamera
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('input')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'input'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Input Pelanggaran / Prestasi
            </button>
            <button
              onClick={() => setActiveTab('recap')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'recap'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Rekap Data ({violations.length})
            </button>
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                activeTab === 'gallery'
                  ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              Galeri Bukti Foto
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1: FORM INPUT PELANGGARAN */}
      {activeTab === 'input' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Form (2 cols) */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
              Formulir Pencatatan Pelanggaran & Poin Prestasi
            </h2>

            <form onSubmit={handleSaveViolation} className="space-y-4 text-xs">
              {/* Student Search */}
              <div className="relative">
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  1. Cari Siswa (Nama / NIS / Scan Kartu RFID)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Ketik nama siswa atau scan kartu siswa..."
                    className="w-full px-3.5 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>

                {filteredStudents.length > 0 && !selectedStudent && (
                  <div className="absolute z-20 left-0 right-0 mt-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 shadow-lg max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredStudents.map((s) => (
                      <div
                        key={s.nis}
                        onClick={() => {
                          setSelectedStudent(s);
                          setSearchTerm(`${s.name} (${s.class_id})`);
                        }}
                        className="p-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                        <span className="text-[11px] text-slate-400">Kelas {s.class_id} • NIS: {s.nis}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Selected Student Card */}
              {selectedStudent && (
                <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 flex items-center justify-center font-bold">
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
                    Ganti
                  </button>
                </div>
              )}

              {/* Violation Type Selector */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  2. Pilih Jenis Pelanggaran / Prestasi
                </label>
                <select
                  value={selectedTypeId}
                  onChange={(e) => setSelectedTypeId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                >
                  <optgroup label="Pelanggaran Ringan">
                    {violationTypes
                      .filter((t) => t.category === 'ringan' && t.is_active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} - {t.name} ({t.default_points} poin)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Pelanggaran Sedang">
                    {violationTypes
                      .filter((t) => t.category === 'sedang' && t.is_active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} - {t.name} ({t.default_points} poin)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Pelanggaran Berat">
                    {violationTypes
                      .filter((t) => t.category === 'berat' && t.is_active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.code} - {t.name} ({t.default_points} poin)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Poin Prestasi & Penghargaan (+)">
                    {violationTypes
                      .filter((t) => t.category === 'prestasi' && t.is_active)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [PRESTASI] {t.name} (+{t.default_points} poin)
                        </option>
                      ))}
                  </optgroup>
                </select>
              </div>

              {/* Point modifier (if allowed by admin) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Poin (Default: {currentType?.default_points || 0})
                  </label>
                  <input
                    type="number"
                    value={customPoints}
                    onChange={(e) => setCustomPoints(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={`Poin default: ${currentType?.default_points}`}
                    disabled={!settings.toggle_allow_edit_violation_points}
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none disabled:bg-slate-100 dark:disabled:bg-slate-800/50"
                  />
                  {!settings.toggle_allow_edit_violation_points && (
                    <span className="text-[10px] text-slate-400">Poin dikunci oleh admin.</span>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Lokasi / Tempat Kejadian
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Contoh: Gerbang belakang, koridor lab..."
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Kejadian & Kronologi Singkat
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Deskripsikan secara objektif..."
                  className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              {/* Foto Bukti: Camera Button (Bagian 1 Poin 7 & Bagian 6) */}
              <div className="p-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Foto Bukti Pelanggaran
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Ambil foto langsung lewat kamera atau unggah dari berkas
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 hover:bg-slate-800"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>{evidenceBase64 ? 'Ubah Foto' : 'Buka Kamera'}</span>
                  </button>
                </div>

                {evidenceBase64 && (
                  <div className="mt-3 flex items-center gap-3">
                    <img
                      src={`data:image/jpeg;base64,${evidenceBase64}`}
                      alt="Bukti"
                      className="w-16 h-16 rounded object-cover border border-slate-200 dark:border-slate-700"
                    />
                    <div>
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        Foto bukti siap dilampirkan
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setEvidenceBase64(null);
                          setEvidenceFileName(null);
                        }}
                        className="text-[11px] text-rose-600 hover:underline mt-1"
                      >
                        Hapus foto ini
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!selectedStudent || isSubmitting}
                className="w-full sm:w-auto px-6 py-2.5 rounded font-semibold text-xs text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Menyimpan Catatan...' : 'Simpan Catatan Pelanggaran'}
              </button>
            </form>
          </div>

          {/* Recent Violations Sidebar (1 col) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">
              Catatan Pelanggaran Terbaru
            </h3>

            {violations.length === 0 ? (
              <p className="text-slate-400 py-4 text-center">Belum ada pelanggaran dicatat.</p>
            ) : (
              <div className="space-y-3">
                {violations.slice(0, 5).map((v) => {
                  const student = students.find((s) => s.nis === v.student_id);
                  return (
                    <div
                      key={v.id}
                      className="p-2.5 rounded border border-slate-200 dark:border-slate-700/80 space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          onClick={() => student && setProfileStudent(student)}
                          className="font-bold text-slate-900 dark:text-white cursor-pointer hover:underline"
                        >
                          {student?.name || v.student_id}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            v.category === 'prestasi' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {v.category === 'prestasi' ? `+${v.points}` : `-${v.points}`} Poin
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">{v.type_name}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                        <span>{new Date(v.recorded_at).toLocaleTimeString('id-ID')}</span>
                        {v.evidence_photo_url && <span className="text-blue-500 font-medium">Ada Foto Bukti</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: REKAP LENGKAP PELANGGARAN */}
      {activeTab === 'recap' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm space-y-4">
          {/* Filters & Export Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={filterClass}
                onChange={(e) => setFilterClass(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">Semua Kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="all">Semua Kategori</option>
                <option value="ringan">Ringan</option>
                <option value="sedang">Sedang</option>
                <option value="berat">Berat</option>
                <option value="prestasi">Prestasi</option>
              </select>

              <input
                type="text"
                placeholder="Cari nama / pelanggaran..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Ekspor Excel</span>
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak PDF</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 font-semibold">
                  <th className="py-2.5">Tanggal</th>
                  <th className="py-2.5">Siswa</th>
                  <th className="py-2.5">Kelas</th>
                  <th className="py-2.5">Kategori</th>
                  <th className="py-2.5">Jenis Pelanggaran</th>
                  <th className="py-2.5">Poin</th>
                  <th className="py-2.5">Bukti</th>
                  <th className="py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredViolations.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Tidak ada data pelanggaran yang sesuai filter.
                    </td>
                  </tr>
                ) : (
                  filteredViolations.map((v) => {
                    const student = students.find((s) => s.nis === v.student_id);
                    return (
                      <tr key={v.id}>
                        <td className="py-2.5 font-mono text-[11px] text-slate-500">
                          {new Date(v.recorded_at).toLocaleDateString('id-ID')}
                        </td>
                        <td
                          onClick={() => student && setProfileStudent(student)}
                          className="py-2.5 font-medium text-slate-900 dark:text-white cursor-pointer hover:underline"
                        >
                          {student?.name || v.student_id}
                        </td>
                        <td className="py-2.5 text-slate-500">{v.class_id}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              v.category === 'prestasi'
                                ? 'bg-emerald-100 text-emerald-800'
                                : v.category === 'berat'
                                ? 'bg-rose-100 text-rose-800'
                                : v.category === 'sedang'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {v.category}
                          </span>
                        </td>
                        <td className="py-2.5">{v.type_name}</td>
                        <td className="py-2.5 font-mono font-bold">
                          <span className={v.category === 'prestasi' ? 'text-emerald-600' : 'text-rose-600'}>
                            {v.category === 'prestasi' ? `+${v.points}` : `-${v.points}`}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {v.evidence_photo_url ? (
                            <a
                              href={v.evidence_photo_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Lihat</span>
                            </a>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            onClick={() => {
                              const reason = prompt('Masukkan alasan penghapusan data:');
                              if (reason) {
                                deleteViolation(v.id, reason);
                              }
                            }}
                            title="Hapus Catatan"
                            className="text-slate-400 hover:text-rose-600 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: GALERI FOTO BUKTI */}
      {activeTab === 'gallery' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
            Galeri Foto Bukti Pelanggaran
          </h2>

          {violations.filter((v) => v.evidence_photo_url).length === 0 ? (
            <p className="text-xs text-slate-400 py-10 text-center">
              Belum ada foto bukti pelanggaran yang diunggah.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {violations
                .filter((v) => v.evidence_photo_url)
                .map((v) => {
                  const student = students.find((s) => s.nis === v.student_id);
                  return (
                    <div
                      key={v.id}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800 flex flex-col justify-between"
                    >
                      <a
                        href={v.evidence_photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block aspect-video bg-black/10 overflow-hidden"
                      >
                        <img
                          src={v.evidence_photo_url}
                          alt={v.type_name}
                          className="w-full h-full object-cover hover:scale-105 transition-transform"
                        />
                      </a>
                      <div className="p-2.5 text-xs">
                        <p className="font-semibold text-slate-900 dark:text-white truncate">
                          {student?.name || v.student_id}
                        </p>
                        <p className="text-[10px] text-slate-500 truncate">{v.type_name}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                          <span>{v.class_id}</span>
                          <span className="font-mono">{new Date(v.recorded_at).toLocaleDateString('id-ID')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Camera Capture Modal */}
      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleCapturePhoto}
      />

      {/* Student Profile Drilldown */}
      <StudentProfileModal
        student={profileStudent}
        onClose={() => setProfileStudent(null)}
      />
    </div>
  );
};
