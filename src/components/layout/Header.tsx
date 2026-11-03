import React from 'react';
import {
  Menu,
  Clock,
  Maximize2,
  Minimize2,
  Lock,
  Volume2,
  VolumeX,
  Database,
  Calendar,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.js';
import { formatServerTime, formatIndonesianDate } from '../../utils/time.js';

interface HeaderProps {
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleSidebar }) => {
  const {
    currentServerTime,
    activeSession,
    isKioskFullscreen,
    toggleKioskFullscreen,
    session,
    lockCurrentMenu,
    settings,
    updateSettings,
    googleSheetsConnected,
  } = useApp();

  const isLockedMenuOpen = Boolean(session?.lockedMenuRole);

  const toggleSound = () => {
    updateSettings({ tts_enabled: !settings.tts_enabled });
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
      {/* Left: Mobile menu & School info */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-1.5 -ml-1 text-slate-500 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Active Session Badge */}
        {activeSession ? (
          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              Sesi: {activeSession.name}
            </span>
            <span className="text-slate-400">
              ({activeSession.start_time} - {activeSession.end_time})
            </span>
            <span className="text-[10px] text-slate-500 bg-white dark:bg-slate-900 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700">
              Tepat Waktu: s/d {activeSession.on_time_limit}
            </span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-700 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            <span>Di Luar Jam Sesi Terjadwal</span>
          </div>
        )}
      </div>

      {/* Right: Server Clock, Kiosk mode, Audio toggle, Lock indicator */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Google Sheets Connection Pill (Bagian 1 & 13) */}
        <div
          title={
            googleSheetsConnected
              ? 'Terhubung dengan Google Sheets & Drive API'
              : 'Penyimpanan lokal aktif (Siap dikoneksikan ke Google Sheets via .env)'
          }
          className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded text-[11px] border ${
            googleSheetsConnected
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
          }`}
        >
          <Database className="w-3 h-3" />
          <span>{googleSheetsConnected ? 'Google Sheets' : 'Penyimpanan Lokal'}</span>
        </div>

        {/* Date & Server Authoritative Clock */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs">
          <Calendar className="hidden lg:inline w-3.5 h-3.5 text-slate-400" />
          <span className="hidden lg:inline text-slate-600 dark:text-slate-300">
            {formatIndonesianDate(currentServerTime)}
          </span>
          <span className="hidden lg:inline text-slate-300 dark:text-slate-600">|</span>
          <Clock className="w-3.5 h-3.5 text-slate-500" />
          <span className="font-mono font-semibold text-slate-900 dark:text-white">
            {formatServerTime(currentServerTime)}
          </span>
        </div>

        {/* Audio Mute/Unmute */}
        <button
          onClick={toggleSound}
          title={settings.tts_enabled ? 'Matikan Suara & TTS' : 'Nyalakan Suara & TTS'}
          className={`p-1.5 rounded border transition-colors ${
            settings.tts_enabled
              ? 'text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
              : 'text-slate-400 bg-slate-100 dark:bg-slate-800 border-transparent'
          }`}
        >
          {settings.tts_enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>

        {/* Kiosk Fullscreen Toggle */}
        <button
          onClick={toggleKioskFullscreen}
          title={isKioskFullscreen ? 'Keluar Layar Penuh' : 'Mode Layar Penuh (Kiosk)'}
          className="p-1.5 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          {isKioskFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* "Kunci Kembali" button if in locked menu */}
        {isLockedMenuOpen && (
          <button
            onClick={lockCurrentMenu}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded hover:bg-amber-100 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Kunci Kembali</span>
          </button>
        )}
      </div>
    </header>
  );
};
