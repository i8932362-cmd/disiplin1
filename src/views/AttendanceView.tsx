import React, { useState, useEffect, useRef } from 'react';
import {
  Scan,
  UserCheck,
  Clock,
  Users,
  AlertTriangle,
  UserX,
  Search,
  Plus,
  Maximize2,
  Minimize2,
  Trash2,
  Edit2,
  CheckCircle,
  X,
  Volume2,
} from 'lucide-react';
import { useApp } from '../context/AppContext.js';
import { formatServerTime, formatIndonesianDate } from '../utils/time.js';
import { AttendanceNotificationModal } from '../components/modals/AttendanceNotificationModal.js';
import { StudentProfileModal } from '../components/modals/StudentProfileModal.js';
import { Student, AttendanceRecord, AttendanceStatus } from '../types/index.js';

export const AttendanceView: React.FC = () => {
  const {
    students,
    attendance,
    activeSession,
    currentServerTime,
    recordAttendance,
    updateAttendance,
    deleteAttendance,
    isKioskFullscreen,
    toggleKioskFullscreen,
    speak,
    showToast,
  } = useApp();

  const [scanInput, setScanInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Notification Modal state
  const [modalStudent, setModalStudent] = useState<Student | null>(null);
  const [modalRecord, setModalRecord] = useState<AttendanceRecord | null>(null);
  const [modalMessage, setModalMessage] = useState<string | undefined>(undefined);
  const [modalIsError, setModalIsError] = useState(false);
  const [showNotificationModal, setShowNotificationModal] = useState(false);

  // Manual Attendance Modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [manualStatus, setManualStatus] = useState<AttendanceStatus>('Hadir');
  const [manualNotes, setManualNotes] = useState('');

  // Edit / Delete Attendance Record state
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editReason, setEditReason] = useState('');
  const [editStatus, setEditStatus] = useState<AttendanceStatus>('Hadir');

  // Drilldown Profile Modal
  const [profileStudent, setProfileStudent] = useState<Student | null>(null);

  // Keep scan input ALWAYS focused (Bagian 4 Poin 60)
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current && !showManualModal && !editingRecord && !profileStudent) {
        inputRef.current.focus();
      }
    };

    focusInput();
    const interval = setInterval(focusInput, 1500);

    const handleWindowFocus = () => focusInput();
    const handleDocumentClick = (e: MouseEvent) => {
      // Don't steal focus if user is clicking on modals or inputs
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'BUTTON' && target.tagName !== 'SELECT' && target.tagName !== 'TEXTAREA') {
        focusInput();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('click', handleDocumentClick);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [showManualModal, editingRecord, profileStudent]);

  // Handle Automatic Scan Submission on Enter (USB Barcode & RFID "Keyboard" Mode)
  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanInput.trim();
    if (!code || isProcessing) return;

    setIsProcessing(true);
    setScanInput(''); // clear immediately for next scan in queue

    const res = await recordAttendance({
      code,
      sessionId: activeSession?.id,
    });

    setIsProcessing(false);

    if (res.success && res.record && res.student) {
      const studentName = res.student.name;
      const studentClass = res.student.class_id;
      let speechMsg = '';
      let displayMsg = '';

      if (res.record.status === 'Hadir') {
        speechMsg = `${studentName}, kelas ${studentClass}, Hadir tepat waktu.`;
        displayMsg = `Selamat pagi, ${studentName}. Kamu hadir tepat waktu di sesi ${activeSession?.name || 'presensi'}.`;
      } else if (res.record.status === 'Terlambat') {
        const lateMin = res.record.late_minutes ?? 0;
        speechMsg = `${studentName}, kelas ${studentClass}, Terlambat ${lateMin > 0 ? `${lateMin} menit.` : '.'}`;
        displayMsg = `Halo, ${studentName}. Kamu tercatat terlambat ${lateMin} menit di sesi ${activeSession?.name || 'presensi'}. Silakan segera masuk kelas.`;
      } else if (res.record.status === 'Izin') {
        speechMsg = `${studentName}, kelas ${studentClass}, Tercatat izin.`;
        displayMsg = `${studentName} tercatat izin di sesi ${activeSession?.name || 'presensi'}.`;
      } else if (res.record.status === 'Sakit') {
        speechMsg = `${studentName}, kelas ${studentClass}, Tercatat sakit.`;
        displayMsg = `${studentName} tercatat sakit di sesi ${activeSession?.name || 'presensi'}.`;
      } else if (res.record.status === 'Alpha') {
        speechMsg = `${studentName}, kelas ${studentClass}, Tercatat alpha.`;
        displayMsg = `${studentName} tercatat alpha di sesi ${activeSession?.name || 'presensi'}.`;
      } else {
        speechMsg = `${studentName}, kelas ${studentClass}, Tercatat ${res.record.status}.`;
        displayMsg = `${studentName} tercatat ${res.record.status}.`;
      }

      setModalStudent(res.student);
      setModalRecord(res.record);
      setModalMessage(displayMsg);
      setModalIsError(false);
      setShowNotificationModal(true);
      // Immediately speak name, class, and status
      speak(speechMsg);
    } else {
      // Error / duplicate / unregistered
      const isDup = res.isDuplicate || (res.error && res.error.toLowerCase().includes('sudah tercatat'));
      let speechMsg = '';
      if (isDup) {
        if (res.student) {
          speechMsg = `${res.student.name}, kelas ${res.student.class_id}, sudah melakukan presensi hari ini.`;
        } else {
          speechMsg = 'Perhatian, siswa sudah melakukan presensi hari ini.';
        }
      } else if (res.error && (res.error.toLowerCase().includes('tidak terdaftar') || res.error.toLowerCase().includes('tidak dikenali'))) {
        speechMsg = 'Kartu tidak terdaftar.';
      } else {
        speechMsg = res.error || 'Presensi gagal.';
      }

      const errorMsg = res.error || 'Kartu tidak dikenali';
      setModalStudent(res.student || null);
      setModalRecord(null);
      setModalMessage(errorMsg);
      setModalIsError(true);
      setShowNotificationModal(true);
      speak(speechMsg);
    }
  };

  // Manual Attendance submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;

    const res = await recordAttendance({
      studentId: selectedStudent.nis,
      sessionId: activeSession?.id,
      status: manualStatus,
      notes: manualNotes,
      method: 'manual',
    });

    if (res.success && res.record) {
      setShowManualModal(false);
      const studentName = selectedStudent.name;
      const studentClass = selectedStudent.class_id;
      const speechMsg = `${studentName}, kelas ${studentClass}, Tercatat ${manualStatus}.`;
      const displayMsg = `Presensi manual ${studentName} (${studentClass}) berhasil disimpan dengan status ${manualStatus}.`;
      setModalStudent(selectedStudent);
      setModalRecord(res.record);
      setModalMessage(displayMsg);
      setModalIsError(false);
      setShowNotificationModal(true);
      speak(speechMsg);

      // Reset
      setSelectedStudent(null);
      setManualSearch('');
      setManualNotes('');
    } else {
      showToast(res.error || 'Gagal menyimpan presensi manual', 'error');
    }
  };

  // Today's attendance calculation
  const todayStr = currentServerTime.toISOString().split('T')[0];
  const todayAttendance = attendance.filter((a) => a.date === todayStr);

  const totalStudents = students.length;
  const hadirCount = todayAttendance.filter((a) => a.status === 'Hadir').length;
  const terlambatCount = todayAttendance.filter((a) => a.status === 'Terlambat').length;
  const sudahPresensiCount = todayAttendance.length;
  const belumPresensiCount = Math.max(0, totalStudents - sudahPresensiCount);

  // Recent attendance list
  const recentAttendance = todayAttendance.slice(0, 10);

  // Filter students for manual modal autocomplete
  const filteredStudents = manualSearch.trim()
    ? students
        .filter(
          (s) =>
            s.name.toLowerCase().includes(manualSearch.toLowerCase()) ||
            s.nis.includes(manualSearch) ||
            s.class_id.toLowerCase().includes(manualSearch.toLowerCase())
        )
        .slice(0, 6)
    : [];

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Top Section: Kiosk Header with Clock, Session, & Counters (Bagian 4 Poin 59) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
          {/* Big Digital Clock & Session */}
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="font-mono text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {formatServerTime(currentServerTime)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                WIB
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {formatIndonesianDate(currentServerTime)}
            </p>
          </div>

          {/* Active Session Info */}
          <div className="text-center md:text-right">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {activeSession ? activeSession.name : 'Tidak Ada Sesi Terjadwal'}
              </span>
            </div>
            {activeSession && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Batas Tepat Waktu: <span className="font-semibold text-slate-800 dark:text-slate-200">{activeSession.on_time_limit}</span> (Toleransi: {activeSession.late_tolerance_minutes}m)
              </p>
            )}
          </div>
        </div>

        {/* Quick Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Siswa</span>
              <Users className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {totalStudents}
            </p>
          </div>

          <div className="p-3 rounded border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Tepat Waktu</span>
              <UserCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold text-emerald-900 dark:text-emerald-300 mt-1">
              {hadirCount}
            </p>
          </div>

          <div className="p-3 rounded border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Terlambat</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-xl font-bold text-amber-900 dark:text-amber-300 mt-1">
              {terlambatCount}
            </p>
          </div>

          <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">Belum Hadir</span>
              <UserX className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">
              {belumPresensiCount}
            </p>
          </div>
        </div>
      </div>

      {/* Center Section: THE MAIN SCAN FRAME (Bagian 4 Poin 60) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 sm:p-10 shadow-sm text-center relative overflow-hidden">
        {/* Pulsing indicator "Siap memindai" */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-700 dark:text-emerald-400 mb-6">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="font-semibold">Siap Memindai (USB RFID / Barcode Scanner)</span>
        </div>

        {/* Scan Icon & Instruction Frame */}
        <div className="max-w-xl mx-auto p-8 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 transition-colors bg-slate-50/50 dark:bg-slate-800/30">
          <Scan className="w-16 h-16 mx-auto text-slate-400 dark:text-slate-500 mb-4 animate-pulse" />
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-2">
            Tempelkan kartu RFID atau scan barcode/QR kartu siswa
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Pembaca kartu bekerja otomatis layaknya keyboard. Cukup tap kartu atau sorot barcode kartu ke alat scanner.
          </p>

          {/* SINGLE AUTOMATIC INPUT FIELD (Bagian 4 Poin 60) */}
          <form onSubmit={handleScanSubmit} className="mt-6">
            <input
              ref={inputRef}
              type="text"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              placeholder="Menunggu pembaca kartu RFID / Barcode scanner..."
              disabled={isProcessing}
              className="w-full text-center px-4 py-3 rounded-md text-sm font-mono border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-inner focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-slate-400"
            />
          </form>

          {/* Quick simulator buttons for easy testing without hardware */}
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-400 block mb-2">
              Uji Coba Cepat (Klik untuk simulasi tap kartu siswa):
            </span>
            <div className="flex flex-wrap justify-center gap-1.5">
              {students.slice(0, 4).map((s) => (
                <button
                  key={s.nis}
                  type="button"
                  onClick={() => {
                    setScanInput(s.rfid_uid);
                    setTimeout(() => {
                      recordAttendance({ code: s.rfid_uid, sessionId: activeSession?.id }).then((res) => {
                        if (res.success && res.record && res.student) {
                          const sName = res.student.name;
                          const sClass = res.student.class_id;
                          let speechMsg = '';
                          if (res.record.status === 'Hadir') {
                            speechMsg = `${sName}, kelas ${sClass}, Hadir tepat waktu.`;
                          } else if (res.record.status === 'Terlambat') {
                            const lateMin = res.record.late_minutes ?? 0;
                            speechMsg = `${sName}, kelas ${sClass}, Terlambat ${lateMin > 0 ? `${lateMin} menit.` : '.'}`;
                          } else {
                            speechMsg = `${sName}, kelas ${sClass}, Tercatat ${res.record.status}.`;
                          }
                          const displayMsg = res.record.status === 'Terlambat'
                            ? `Halo, ${sName}. Kamu tercatat terlambat ${res.record.late_minutes} menit.`
                            : `Selamat pagi, ${sName}. Kamu hadir tepat waktu.`;
                          setModalStudent(res.student);
                          setModalRecord(res.record);
                          setModalMessage(displayMsg);
                          setModalIsError(false);
                          setShowNotificationModal(true);
                          speak(speechMsg);
                        } else {
                          const isDup = res.isDuplicate || (res.error && res.error.toLowerCase().includes('sudah tercatat'));
                          const speechMsg = isDup
                            ? `${res.student ? res.student.name : s.name}, kelas ${res.student ? res.student.class_id : s.class_id}, sudah melakukan presensi hari ini.`
                            : res.error || 'Presensi gagal';
                          setModalStudent(res.student || s);
                          setModalRecord(null);
                          setModalMessage(res.error || 'Sudah presensi');
                          setModalIsError(true);
                          setShowNotificationModal(true);
                          speak(speechMsg);
                        }
                      });
                    }, 50);
                  }}
                  className="px-2.5 py-1 rounded text-[11px] font-medium bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600"
                >
                  Tap {s.name.split(' ')[0]} ({s.rfid_uid})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Presensi Manual Button, Uji Suara TTS, & Fullscreen (Bagian 4 Poin 70) */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Presensi Manual</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const sampleStudent = students[0];
              const testMsg = sampleStudent
                ? `${sampleStudent.name}, kelas ${sampleStudent.class_id}, Hadir tepat waktu.`
                : 'Budi Santoso, kelas 10 RPL 1, Hadir tepat waktu.';
              speak(testMsg);
              showToast(`Uji suara: "${testMsg}"`, 'info');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title="Uji coba pembacaan nama, kelas, dan status suara presensi"
          >
            <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Uji Suara TTS</span>
          </button>

          <button
            type="button"
            onClick={toggleKioskFullscreen}
            className="flex items-center gap-1.5 px-3 py-2 rounded text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {isKioskFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isKioskFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh'}</span>
          </button>
        </div>
      </div>

      {/* Bottom Section: Recent Real-Time Attendance List (Bagian 4 Poin 62) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Presensi Terbaru Real-Time ({todayAttendance.length} siswa hari ini)
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">Diperbarui otomatis</span>
        </div>

        {recentAttendance.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs">
            Belum ada siswa yang melakukan presensi hari ini.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
            {recentAttendance.map((rec) => {
              const student = students.find((s) => s.nis === rec.student_id);
              return (
                <div
                  key={rec.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30 px-2 rounded"
                >
                  <div
                    onClick={() => student && setProfileStudent(student)}
                    className="flex items-center gap-3 cursor-pointer min-w-0"
                  >
                    <div className="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-700 dark:text-slate-300 overflow-hidden shrink-0">
                      {student?.photo_url ? (
                        <img src={student.photo_url} alt={student.name} className="w-full h-full object-cover" />
                      ) : (
                        student?.name.slice(0, 2).toUpperCase() || '!'
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 dark:text-white truncate hover:underline">
                        {student?.name || rec.student_id}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Kelas {student?.class_id || '-'} • NIS: {rec.student_id} • Metode: {rec.method}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-slate-600 dark:text-slate-400">
                      {new Date(rec.timestamp).toLocaleTimeString('id-ID')}
                    </span>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        rec.status === 'Hadir'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400'
                          : rec.status === 'Terlambat'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-400'
                          : 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-400'
                      }`}
                    >
                      {rec.status} {rec.late_minutes > 0 ? `(+${rec.late_minutes}m)` : ''}
                    </span>

                    {/* Edit / Delete action */}
                    <button
                      onClick={() => {
                        setEditingRecord(rec);
                        setEditStatus(rec.status);
                        setEditReason('');
                      }}
                      title="Koreksi presensi"
                      className="text-slate-400 hover:text-slate-600 p-1"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Manual Attendance Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Presensi Manual Siswa
              </h3>
              <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualSubmit} className="mt-4 space-y-4 text-xs">
              {/* Autocomplete Search */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Cari Siswa (Ketik Nama / NIS / Kelas)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={manualSearch}
                    onChange={(e) => {
                      setManualSearch(e.target.value);
                      setSelectedStudent(null);
                    }}
                    placeholder="Contoh: Ahmad, 20261001, atau RPL..."
                    className="w-full px-3 py-2 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                  <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                </div>

                {filteredStudents.length > 0 && !selectedStudent && (
                  <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                    {filteredStudents.map((s) => (
                      <div
                        key={s.nis}
                        onClick={() => {
                          setSelectedStudent(s);
                          setManualSearch(`${s.name} (${s.class_id})`);
                        }}
                        className="p-2 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-900 dark:text-white">{s.name}</span>
                        <span className="text-[10px] text-slate-400">{s.class_id} • NIS: {s.nis}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedStudent && (
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold">
                    {selectedStudent.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{selectedStudent.name}</p>
                    <p className="text-[10px] text-slate-500">Kelas: {selectedStudent.class_id} • NIS: {selectedStudent.nis}</p>
                  </div>
                </div>
              )}

              {/* Status Selector */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Status Presensi
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {(['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpha'] as AttendanceStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setManualStatus(st)}
                      className={`py-1.5 px-2 rounded border text-xs font-semibold text-center transition-colors ${
                        manualStatus === st
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white'
                          : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Catatan / Keterangan
                </label>
                <input
                  type="text"
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  placeholder="Contoh: Mengikuti lomba, surat dokter, dll."
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={!selectedStudent}
                  className="px-4 py-1.5 rounded font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 disabled:opacity-50"
                >
                  Simpan Presensi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Record Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              Koreksi / Hapus Presensi
            </h3>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Ubah Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  {['Hadir', 'Terlambat', 'Izin', 'Sakit', 'Alpha'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-500 mb-1">Alasan Koreksi (Wajib untuk Audit Log)</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Alasan perubahan data..."
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!editReason.trim()) {
                      showToast('Alasan pembatalan wajib diisi.', 'error');
                      return;
                    }
                    deleteAttendance(editingRecord.id, editReason);
                    setEditingRecord(null);
                  }}
                  className="px-3 py-1.5 rounded text-rose-600 border border-rose-200 hover:bg-rose-50"
                >
                  Hapus Data
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRecord(null)}
                    className="px-3 py-1.5 text-slate-600"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!editReason.trim()) {
                        showToast('Alasan koreksi wajib diisi.', 'error');
                        return;
                      }
                      updateAttendance(editingRecord.id, { status: editStatus }, editReason);
                      setEditingRecord(null);
                    }}
                    className="px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-800"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Center Scan Notification Modal */}
      {showNotificationModal && (
        <AttendanceNotificationModal
          student={modalStudent}
          record={modalRecord}
          session={activeSession}
          customMessage={modalMessage}
          isError={modalIsError}
          onClose={() => setShowNotificationModal(false)}
        />
      )}

      {/* Drill-down Student Profile */}
      <StudentProfileModal
        student={profileStudent}
        onClose={() => setProfileStudent(null)}
      />
    </div>
  );
};
