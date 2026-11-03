import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldAlert, GraduationCap, Sliders, AlertCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.js';

export const DutyLoginScreen: React.FC = () => {
  const { loginDuty, unlockHomeroom, unlockStudentAffairs, unlockAdmin, settings, classes } = useApp();
  const [selectedRole, setSelectedRole] = useState<'duty' | 'homeroom' | 'student_affairs' | 'admin'>('duty');

  // Input states
  const [password, setPassword] = useState('');
  const [homeroomName, setHomeroomName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [lockoutTimer, setLockoutTimer] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    if (selectedRole === 'homeroom' && !homeroomName.trim()) {
      setErrorMsg('Nama wali kelas wajib diisi.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    if (selectedRole === 'duty') {
      const res = await loginDuty(password);
      setLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Password salah');
        if (res.lockedForSeconds) {
          setLockoutTimer(res.lockedForSeconds);
          const interval = setInterval(() => {
            setLockoutTimer((prev) => {
              if (prev === null || prev <= 1) {
                clearInterval(interval);
                return null;
              }
              return prev - 1;
            });
          }, 1000);
        }
      }
    } else if (selectedRole === 'homeroom') {
      const res = await unlockHomeroom(homeroomName, password);
      setLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Autentikasi wali kelas gagal');
      }
    } else if (selectedRole === 'student_affairs') {
      const res = await unlockStudentAffairs(password);
      setLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Password kesiswaan salah');
      }
    } else if (selectedRole === 'admin') {
      const res = await unlockAdmin(password);
      setLoading(false);
      if (!res.success) {
        setErrorMsg(res.error || 'Password admin salah');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-md">
        {/* Brand / Logo */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold text-lg mb-2 shadow-sm">
            DKB
          </div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            DISIPLIN KITA BISA
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {settings.school_name}
          </p>
        </div>

        {/* Role Tabs */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-5 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setSelectedRole('duty');
              setErrorMsg('');
              setPassword('');
            }}
            className={`py-1.5 px-2 rounded-md transition-all text-center flex flex-col items-center justify-center gap-1 ${
              selectedRole === 'duty'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="truncate w-full">Piket</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole('homeroom');
              setErrorMsg('');
              setPassword('');
            }}
            className={`py-1.5 px-2 rounded-md transition-all text-center flex flex-col items-center justify-center gap-1 ${
              selectedRole === 'homeroom'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <GraduationCap className="w-3.5 h-3.5" />
            <span className="truncate w-full">Wali Kelas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole('student_affairs');
              setErrorMsg('');
              setPassword('');
            }}
            className={`py-1.5 px-2 rounded-md transition-all text-center flex flex-col items-center justify-center gap-1 ${
              selectedRole === 'student_affairs'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span className="truncate w-full">Kesiswaan</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedRole('admin');
              setErrorMsg('');
              setPassword('');
            }}
            className={`py-1.5 px-2 rounded-md transition-all text-center flex flex-col items-center justify-center gap-1 ${
              selectedRole === 'admin'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="truncate w-full">Admin</span>
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start gap-2 text-xs text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p>{errorMsg}</p>
              {lockoutTimer !== null && (
                <p className="font-semibold mt-1">Tunggu {lockoutTimer} detik lagi...</p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {selectedRole === 'homeroom' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Nama Wali Kelas
              </label>
              <input
                type="text"
                list="initial-login-teachers"
                value={homeroomName}
                onChange={(e) => setHomeroomName(e.target.value)}
                placeholder="Pilih atau ketik nama Anda..."
                required
                autoFocus
                className="w-full px-3 py-2 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-400"
              />
              <datalist id="initial-login-teachers">
                {classes.map((c) => (
                  <option key={c.id} value={c.homeroom_teacher_name}>
                    {c.name} ({c.homeroom_teacher_name})
                  </option>
                ))}
              </datalist>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Sistem akan otomatis membuka kelas yang Anda ampu setelah masuk.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {selectedRole === 'duty' && 'Password Petugas Piket'}
              {selectedRole === 'homeroom' && 'Password Wali Kelas'}
              {selectedRole === 'student_affairs' && 'Password Kesiswaan'}
              {selectedRole === 'admin' && 'Password Administrator'}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi..."
                disabled={loading || (selectedRole === 'duty' && lockoutTimer !== null)}
                autoFocus={selectedRole !== 'homeroom'}
                className="w-full px-3 py-2 pr-10 text-sm rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-400 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !password.trim() || (selectedRole === 'duty' && lockoutTimer !== null)}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors disabled:opacity-50 shadow-xs"
          >
            {loading ? 'Memeriksa kredensial...' : 'Masuk ke Aplikasi'}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
          <p className="text-[11px] text-slate-400">
            {selectedRole === 'duty' && (
              <>Sandi bawaan setup: <span className="font-mono text-slate-600 dark:text-slate-300">piket123</span></>
            )}
            {selectedRole === 'homeroom' && (
              <>Sandi bawaan wali kelas: <span className="font-mono text-slate-600 dark:text-slate-300">wali123</span></>
            )}
            {selectedRole === 'student_affairs' && (
              <>Sandi bawaan kesiswaan: <span className="font-mono text-slate-600 dark:text-slate-300">kesiswaan123</span></>
            )}
            {selectedRole === 'admin' && (
              <>Sandi bawaan admin: <span className="font-mono text-slate-600 dark:text-slate-300">admin123</span></>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

interface SecondaryUnlockModalProps {
  role: 'homeroom' | 'student_affairs' | 'admin' | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SecondaryUnlockModal: React.FC<SecondaryUnlockModalProps> = ({
  role,
  onClose,
  onSuccess,
}) => {
  const { classes, unlockHomeroom, unlockStudentAffairs, unlockAdmin } = useApp();

  // Homeroom state
  const [homeroomName, setHomeroomName] = useState('');
  const [homeroomPassword, setHomeroomPassword] = useState('');

  // Student affairs & admin password state
  const [singlePassword, setSinglePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!role) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    let res: { success: boolean; error?: string } = { success: false };

    if (role === 'homeroom') {
      res = await unlockHomeroom(homeroomName, homeroomPassword);
    } else if (role === 'student_affairs') {
      res = await unlockStudentAffairs(singlePassword);
    } else if (role === 'admin') {
      res = await unlockAdmin(singlePassword);
    }

    setLoading(false);
    if (res.success) {
      onSuccess();
      onClose();
    } else {
      setErrorMsg(res.error || 'Autentikasi gagal.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            {role === 'homeroom' && <GraduationCap className="w-5 h-5 text-slate-700 dark:text-slate-300" />}
            {role === 'student_affairs' && <ShieldAlert className="w-5 h-5 text-slate-700 dark:text-slate-300" />}
            {role === 'admin' && <Sliders className="w-5 h-5 text-slate-700 dark:text-slate-300" />}
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {role === 'homeroom' && 'Buka Akses Wali Kelas'}
              {role === 'student_affairs' && 'Buka Akses Kesiswaan'}
              {role === 'admin' && 'Buka Akses Administrator'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 my-2">
          {role === 'homeroom'
            ? 'Masukkan nama dan kata sandi Anda. Anda akan otomatis diarahkan ke kelas yang diampu.'
            : 'Masukkan kata sandi untuk membuka portal ini.'}
        </p>

        {errorMsg && (
          <div className="mb-3 p-2.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {role === 'homeroom' ? (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Wali Kelas *
                </label>
                <input
                  type="text"
                  list="homeroom-teachers-list"
                  placeholder="Ketik nama atau pilih nama wali kelas..."
                  value={homeroomName}
                  onChange={(e) => setHomeroomName(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3 py-1.5 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
                <datalist id="homeroom-teachers-list">
                  {classes.map((c) => (
                    <option key={c.id} value={c.homeroom_teacher_name}>
                      {c.name} ({c.homeroom_teacher_name})
                    </option>
                  ))}
                </datalist>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Contoh bawaan: Dra. Siti Aminah, M.Pd (Kelas X RPL 1)
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Kata Sandi Wali Kelas *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Masukkan sandi..."
                    value={homeroomPassword}
                    onChange={(e) => setHomeroomPassword(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 pr-9 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 px-2.5 flex items-center text-slate-400"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Sandi bawaan setup: <span className="font-mono">wali123</span>
                </span>
              </div>
            </>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                {role === 'student_affairs' ? 'Password Kesiswaan' : 'Password Administrator'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Masukkan password..."
                  value={singlePassword}
                  onChange={(e) => setSinglePassword(e.target.value)}
                  autoFocus
                  required
                  className="w-full px-3 py-1.5 pr-10 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  className="absolute inset-y-0 right-0 px-2.5 flex items-center text-slate-400"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-300"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-100 dark:text-slate-900 rounded hover:bg-slate-800 dark:hover:bg-slate-200 disabled:opacity-50"
            >
              {loading ? 'Memverifikasi...' : 'Buka Akses'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
