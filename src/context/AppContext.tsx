import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  AuthSession,
  ActiveTab,
  SyncStatus,
  AppSettings,
  SchoolClass,
  AttendanceSession,
  Student,
  ViolationType,
  AttendanceRecord,
  OutOfClassRecord,
  ViolationRecord,
  LeaveRequest,
  NotificationSettings,
  NotificationLog,
  AuditLog,
  DeltaChange,
} from '../types/index.js';
import { setServerClockOffset, getServerNow } from '../utils/time.js';
import { soundEffects } from '../utils/audio.js';
import { ttsService } from '../utils/tts.js';
import {
  initGoogleAuth,
  signInWithGoogle,
  disconnectGoogleAccount,
  getOrCreateDriveFolder,
  getOrCreateSpreadsheet,
  syncAllDataToGoogleSheets,
  getAccessToken,
  ConnectedGoogleAccount,
} from '../utils/googleWorkspace.js';

interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface AppContextType {
  session: AuthSession | null;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  syncStatus: SyncStatus;
  lastSyncTime: Date | null;
  currentServerTime: Date;
  activeSession: AttendanceSession | null;
  isKioskFullscreen: boolean;
  toggleKioskFullscreen: () => void;

  // Google Workspace Integration
  googleAccount: ConnectedGoogleAccount | null;
  googleSyncing: boolean;
  connectGoogle: (promptSelect?: boolean) => Promise<{ success: boolean; error?: string }>;
  disconnectGoogle: () => Promise<void>;
  syncGoogleSheetsNow: () => Promise<{ success: boolean; rowsUpdated?: number; error?: string }>;

  // Data
  settings: AppSettings;
  classes: SchoolClass[];
  sessions: AttendanceSession[];
  students: Student[];
  violationTypes: ViolationType[];
  attendance: AttendanceRecord[];
  outOfClass: OutOfClassRecord[];
  violations: ViolationRecord[];
  leaveRequests: LeaveRequest[];
  notificationSettings: NotificationSettings;
  notificationLogs: NotificationLog[];
  auditLogs: AuditLog[];
  serverVersion: number;
  googleSheetsConnected: boolean;

  // Actions
  loginDuty: (password: string) => Promise<{ success: boolean; error?: string; remainingAttempts?: number; lockedForSeconds?: number }>;
  unlockHomeroom: (name: string, password: string, classId?: string) => Promise<{ success: boolean; error?: string; classId?: string }>;
  unlockStudentAffairs: (password: string) => Promise<{ success: boolean; error?: string }>;
  unlockAdmin: (password: string) => Promise<{ success: boolean; error?: string }>;
  lockCurrentMenu: () => void;
  logout: () => void;
  updateSessionToken: (newToken: string) => void;
  syncNow: () => Promise<void>;

  // Mutators
  recordAttendance: (params: { code?: string; studentId?: string; sessionId?: string; status?: string; notes?: string; method?: string }) => Promise<{ success: boolean; record?: AttendanceRecord; student?: Student; session?: AttendanceSession; error?: string; isDuplicate?: boolean }>;
  updateAttendance: (id: string, updates: Partial<AttendanceRecord>, reason: string) => Promise<boolean>;
  deleteAttendance: (id: string, reason: string) => Promise<boolean>;

  startOutOfClass: (studentId: string, type: 'BAK' | 'BAB' | 'Keperluan Lain', durationMinutes: number) => Promise<{ success: boolean; record?: OutOfClassRecord; student?: Student; error?: string }>;
  confirmOutOfClassReturn: (id: string, returnMethod?: 'click' | 'manual', notes?: string, auditReason?: string) => Promise<{ success: boolean; record?: OutOfClassRecord; error?: string }>;

  recordViolation: (params: { studentId: string; violationTypeId: string; customPoints?: number; notes?: string; location?: string; evidenceBase64?: string; evidenceFileName?: string }) => Promise<{ success: boolean; violation?: ViolationRecord; studentTotalPoints?: number; error?: string }>;
  deleteViolation: (id: string, reason: string) => Promise<boolean>;

  saveStudent: (student: Student) => Promise<boolean>;
  deleteStudent: (nis: string) => Promise<boolean>;
  batchImportStudents: (students: Student[]) => Promise<{ success: boolean; added: number; updated: number }>;

  saveClass: (cls: SchoolClass) => Promise<boolean>;
  deleteClass: (id: string) => Promise<boolean>;

  saveSession: (sess: AttendanceSession) => Promise<boolean>;
  deleteSession: (id: string) => Promise<boolean>;

  saveViolationType: (vt: ViolationType) => Promise<boolean>;
  deleteViolationType: (id: string) => Promise<boolean>;

  updateSettings: (updates: Partial<AppSettings>) => Promise<boolean>;
  updateNotificationSettings: (updates: Partial<NotificationSettings>) => Promise<boolean>;
  sendTestEmail: (email: string) => Promise<{ success: boolean; message: string }>;
  sendWeeklyRecap: (classId?: string) => Promise<{ success: boolean; message: string; results?: any; sent?: boolean; recipient?: string }>;

  approveLeaveRequest: (id: string, status: 'approved' | 'rejected', rejectionReason?: string) => Promise<boolean>;

  // UI Helpers
  toasts: ToastNotification[];
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
  speak: (text: string) => void;
}

const defaultSettings: AppSettings = {
  school_name: 'SMK BISA HEBAT NUSANTARA',
  logo_url: '',
  background_url: '',
  accent_color: '#0f172a',
  theme: 'light',
  tts_enabled: true,
  tts_rate: 1.0,
  tts_pitch: 1.0,
  tts_volume: 1.0,
  tts_template_present: 'Selamat pagi, {nama}. Kamu hadir tepat waktu di sesi {sesi}.',
  tts_template_late: 'Halo, {nama}. Kamu tercatat terlambat {menit} menit di sesi {sesi}. Silakan segera masuk kelas.',
  tts_template_out_of_class: '{nama}, izin keluar {tipe} selama {durasi} menit dimulai. Harap kembali tepat waktu.',
  tts_template_overdue: 'Perhatian! {nama} dari kelas {kelas} telah melebihi waktu izin keluar kelas.',
  discipline_late_weight: 2,
  discipline_alpha_weight: 10,
  discipline_late_return_weight: 1,
  discipline_full_attendance_bonus: 5,
  out_of_class_max_per_class: 2,
  out_of_class_max_per_student_daily: 2,
  out_of_class_bak_duration: 5,
  out_of_class_bab_duration: 10,
  out_of_class_other_duration: 2,
  toggle_allow_edit_violation_points: true,
  toggle_email_notifications: false,
  toggle_kiosk_mode: false,
  updated_at: new Date().toISOString(),
};

const defaultNotificationSettings: NotificationSettings = {
  email_enabled: false,
  trigger_late: true,
  trigger_alpha: true,
  trigger_leave: true,
  trigger_violation: true,
  trigger_warning_threshold: true,
  trigger_overdue_out_of_class: true,
  warning_threshold_points: 25,
  subject_template: 'Pemberitahuan Kedisiplinan Siswa: {nama_siswa} ({kelas})',
  body_template: 'Yth. Orang Tua / Wali dari {nama_siswa},\n\nKami menginformasikan bahwa siswa tercatat: {status}.\n\n{nama_sekolah}',
  weekly_recap_enabled: true,
  weekly_recap_day: 5,
  weekly_recap_time: '15:00',
  weekly_recap_last_sent: undefined,
  updated_at: new Date().toISOString(),
};

const AppContext = createContext<AppContextType | null>(null);

function getCachedData<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(() => {
    try {
      const saved = localStorage.getItem('dkb_session');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Ensure privileged roles always start locked on reload or startup
      return {
        ...parsed,
        lockedMenuRole: undefined,
        lockedMenuClassId: undefined,
        lockedMenuExpiresAt: undefined,
      };
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTabState] = useState<ActiveTab>('dashboard');

  // Auto-lock admin, wali kelas, and kesiswaan whenever switching between menus
  const setActiveTab = useCallback((newTab: ActiveTab) => {
    setActiveTabState((prevTab) => {
      if (prevTab !== newTab) {
        setSession((currentSession) => {
          if (currentSession && currentSession.lockedMenuRole && currentSession.lockedMenuRole !== newTab) {
            const updated: AuthSession = {
              ...currentSession,
              lockedMenuRole: undefined,
              lockedMenuClassId: undefined,
              lockedMenuExpiresAt: undefined,
            };
            try {
              localStorage.setItem('dkb_session', JSON.stringify(updated));
            } catch {}
            return updated;
          }
          return currentSession;
        });
      }
      return newTab;
    });
  }, []);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'synced');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(new Date());
  const [currentServerTime, setCurrentServerTime] = useState<Date>(getServerNow());
  const [serverVersion, setServerVersion] = useState<number>(() => getCachedData('dkb_cache_version', 0));
  const [googleSheetsConnected, setGoogleSheetsConnected] = useState<boolean>(false);
  const [googleAccount, setGoogleAccount] = useState<ConnectedGoogleAccount | null>(null);
  const [googleSyncing, setGoogleSyncing] = useState<boolean>(false);
  const [isKioskFullscreen, setIsKioskFullscreen] = useState<boolean>(false);

  // Initialize Google Auth state listener
  useEffect(() => {
    const unsub = initGoogleAuth(
      (user, token) => {
        setGoogleAccount({
          email: user.email || '',
          name: user.displayName || user.email || 'Admin Google',
          photo: user.photoURL || undefined,
          uid: user.uid,
          connectedAt: new Date().toISOString(),
        });
        setGoogleSheetsConnected(true);
      },
      () => {
        setGoogleAccount(null);
        setGoogleSheetsConnected(false);
      }
    );
    return () => {
      unsub();
    };
  }, []);

  // Core Data States with Instant Offline Persistence
  const [settings, setSettings] = useState<AppSettings>(() => getCachedData('dkb_cache_settings', defaultSettings));
  const [classes, setClasses] = useState<SchoolClass[]>(() => getCachedData('dkb_cache_classes', []));
  const [sessions, setSessions] = useState<AttendanceSession[]>(() => getCachedData('dkb_cache_sessions', []));
  const [students, setStudents] = useState<Student[]>(() => getCachedData('dkb_cache_students', []));
  const [violationTypes, setViolationTypes] = useState<ViolationType[]>(() => getCachedData('dkb_cache_violation_types', []));
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(() => getCachedData('dkb_cache_attendance', []));
  const [outOfClass, setOutOfClass] = useState<OutOfClassRecord[]>(() => getCachedData('dkb_cache_out_of_class', []));
  const [violations, setViolations] = useState<ViolationRecord[]>(() => getCachedData('dkb_cache_violations', []));
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>(() => getCachedData('dkb_cache_leave_requests', []));
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => getCachedData('dkb_cache_notification_settings', defaultNotificationSettings));
  const [notificationLogs, setNotificationLogs] = useState<NotificationLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Toasts
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  const isSyncingRef = useRef(false);
  const versionRef = useRef(0);
  versionRef.current = serverVersion;

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const speak = useCallback(
    (text: string) => {
      ttsService.speak(text, {
        enabled: settings.tts_enabled !== false,
        rate: settings.tts_rate && settings.tts_rate > 1.0 ? settings.tts_rate : 1.1,
        pitch: settings.tts_pitch || 1.0,
        volume: settings.tts_volume || 1.0,
      });
    },
    [settings]
  );

  // Clock Ticking effect (1 sec interval based on synced clock)
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentServerTime(getServerNow());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Compute Active Session based on server time & day
  const activeSession = React.useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const now = currentServerTime;
    const currentDay = now.getDay();
    const currentH = now.getHours();
    const currentM = now.getMinutes();
    const currentTimeMinutes = currentH * 60 + currentM;

    // Filter active sessions for today
    const validToday = sessions.filter(
      (s) => s.is_active && (s.active_days ? s.active_days.includes(currentDay) : true)
    );

    // Find session where currentTime is between start and end
    for (const s of validToday) {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const [eh, em] = s.end_time.split(':').map(Number);
      const startMinutes = sh * 60 + sm;
      const endMinutes = eh * 60 + em;
      if (currentTimeMinutes >= startMinutes && currentTimeMinutes <= endMinutes) {
        return s;
      }
    }

    // Default to the first session if within tolerance or upcoming
    return validToday[0] || sessions[0] || null;
  }, [sessions, currentServerTime]);

  // Apply Delta Changes to state without interrupting user interactions
  const applyDeltaChanges = useCallback((changes: DeltaChange[]) => {
    if (!changes || changes.length === 0) return;

    for (const chg of changes) {
      const { entity, entity_id, action, data } = chg;

      switch (entity) {
        case 'attendance':
          if (action === 'insert') {
            setAttendance((prev) => {
              if (prev.some((a) => a.id === entity_id)) return prev;
              return [data, ...prev];
            });
          } else if (action === 'update') {
            setAttendance((prev) => prev.map((a) => (a.id === entity_id ? data : a)));
          } else if (action === 'delete') {
            setAttendance((prev) => prev.filter((a) => a.id !== entity_id));
          }
          break;

        case 'out_of_class':
          if (action === 'insert') {
            setOutOfClass((prev) => {
              if (prev.some((o) => o.id === entity_id)) return prev;
              return [data, ...prev];
            });
          } else if (action === 'update') {
            setOutOfClass((prev) => prev.map((o) => (o.id === entity_id ? data : o)));
          }
          break;

        case 'violations':
          if (action === 'insert') {
            setViolations((prev) => {
              if (prev.some((v) => v.id === entity_id)) return prev;
              return [data, ...prev];
            });
          } else if (action === 'delete') {
            setViolations((prev) => prev.filter((v) => v.id !== entity_id));
          }
          break;

        case 'students':
          if (action === 'insert') {
            setStudents((prev) => {
              if (prev.some((s) => s.nis === entity_id)) return prev;
              return [...prev, data];
            });
          } else if (action === 'update') {
            setStudents((prev) => prev.map((s) => (s.nis === entity_id ? data : s)));
          } else if (action === 'delete') {
            setStudents((prev) => prev.filter((s) => s.nis !== entity_id));
          }
          break;

        case 'classes':
          if (action === 'insert') {
            setClasses((prev) => [...prev, data]);
          } else if (action === 'update') {
            setClasses((prev) => prev.map((c) => (c.id === entity_id ? data : c)));
          } else if (action === 'delete') {
            setClasses((prev) => prev.filter((c) => c.id !== entity_id));
          }
          break;

        case 'sessions':
          if (action === 'insert') {
            setSessions((prev) => [...prev, data]);
          } else if (action === 'update') {
            setSessions((prev) => prev.map((s) => (s.id === entity_id ? data : s)));
          } else if (action === 'delete') {
            setSessions((prev) => prev.filter((s) => s.id !== entity_id));
          }
          break;

        case 'violation_types':
          if (action === 'insert') {
            setViolationTypes((prev) => [...prev, data]);
          } else if (action === 'update') {
            setViolationTypes((prev) => prev.map((vt) => (vt.id === entity_id ? data : vt)));
          } else if (action === 'delete') {
            setViolationTypes((prev) => prev.filter((vt) => vt.id !== entity_id));
          }
          break;

        case 'leave_requests':
          if (action === 'insert') {
            setLeaveRequests((prev) => {
              if (prev.some((lr) => lr.id === entity_id)) return prev;
              return [data, ...prev];
            });
          } else if (action === 'update') {
            setLeaveRequests((prev) => prev.map((lr) => (lr.id === entity_id ? data : lr)));
          } else if (action === 'delete') {
            setLeaveRequests((prev) => prev.filter((lr) => lr.id !== entity_id));
          }
          break;

        case 'settings':
          if (data) setSettings(data);
          break;

        case 'notification_settings':
          if (data) setNotificationSettings(data);
          break;

        case 'users':
          // If current user modified or invalidated
          if (session && session.userId === entity_id) {
            if (action === 'delete' || (data && data.token_version > (session as any).tokenVersion)) {
              showToast('Sesi Anda telah kedaluwarsa karena perubahan kata sandi.', 'error');
              setSession(null);
              localStorage.removeItem('dkb_session');
            }
          }
          break;
      }
    }
  }, [session, showToast]);

  // Delta Sync Call
  const syncNow = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setSyncStatus('syncing');

    try {
      let since = versionRef.current;
      // If client has no classes or students in local state, force full snapshot from server
      if (classes.length === 0 || students.length === 0) {
        since = 0;
      }

      const res = await fetch(`/api/sync?since=${since}`, {
        headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Sync HTTP error: ${res.status}`);
      }

      const data = await res.json();

      // Update Clock Offset
      if (data.serverTime) {
        setServerClockOffset(data.serverTime);
      }

      // Flush offline queue if back online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const rawQ = localStorage.getItem('dkb_offline_queue');
          if (rawQ) {
            const queue = JSON.parse(rawQ);
            if (Array.isArray(queue) && queue.length > 0) {
              const remaining: any[] = [];
              let uploaded = 0;
              for (const item of queue) {
                try {
                  const url = item.type === 'attendance' ? '/api/attendance' : item.type === 'out_of_class' ? '/api/out-of-class' : '/api/violations';
                  const pushRes = await fetch(url, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
                    },
                    body: JSON.stringify(item.payload),
                  });
                  if (pushRes.ok) {
                    uploaded++;
                  } else {
                    remaining.push(item);
                  }
                } catch {
                  remaining.push(item);
                }
              }
              if (remaining.length > 0) {
                localStorage.setItem('dkb_offline_queue', JSON.stringify(remaining));
              } else {
                localStorage.removeItem('dkb_offline_queue');
              }
              if (uploaded > 0) {
                showToast(`Sinkronisasi Offline: ${uploaded} data presensi tersimpan berhasil disinkronkan ke server.`, 'success');
              }
            }
          }
        } catch (e) {
          console.warn('Flush offline queue error:', e);
        }
      }

      if (data.fullSnapshot && data.data) {
        // Full Snapshot initialization or client caught up
        setSettings(data.data.settings || defaultSettings);
        setClasses(data.data.classes || []);
        setSessions(data.data.sessions || []);
        setStudents(data.data.students || []);
        setViolationTypes(data.data.violation_types || []);
        setAttendance(data.data.attendance || []);
        setOutOfClass(data.data.out_of_class || []);
        setViolations(data.data.violations || []);
        setLeaveRequests(data.data.leave_requests || []);
        if (data.data.notification_settings) {
          setNotificationSettings(data.data.notification_settings);
        }

        try {
          if (data.data.settings) localStorage.setItem('dkb_cache_settings', JSON.stringify(data.data.settings));
          if (data.data.classes) localStorage.setItem('dkb_cache_classes', JSON.stringify(data.data.classes));
          if (data.data.sessions) localStorage.setItem('dkb_cache_sessions', JSON.stringify(data.data.sessions));
          if (data.data.students) localStorage.setItem('dkb_cache_students', JSON.stringify(data.data.students));
          if (data.data.violation_types) localStorage.setItem('dkb_cache_violation_types', JSON.stringify(data.data.violation_types));
          if (data.data.attendance) localStorage.setItem('dkb_cache_attendance', JSON.stringify(data.data.attendance));
          if (data.data.out_of_class) localStorage.setItem('dkb_cache_out_of_class', JSON.stringify(data.data.out_of_class));
          if (data.data.violations) localStorage.setItem('dkb_cache_violations', JSON.stringify(data.data.violations));
          if (data.data.leave_requests) localStorage.setItem('dkb_cache_leave_requests', JSON.stringify(data.data.leave_requests));
          localStorage.setItem('dkb_cache_version', String(data.version));
        } catch {}
      } else if (data.changes) {
        applyDeltaChanges(data.changes);
      }

      setServerVersion(data.version);
      versionRef.current = data.version;
      try {
        localStorage.setItem('dkb_cache_version', String(data.version));
      } catch {}
      setSyncStatus('synced');
      setLastSyncTime(new Date());
    } catch (err) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
      } else {
        setSyncStatus('error');
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [session, applyDeltaChanges]);

  // Initial Setup and Sync Check
  useEffect(() => {
    fetch('/api/setup')
      .then((r) => r.json())
      .then((res) => {
        if (res.googleSheetsConnected !== undefined) {
          setGoogleSheetsConnected(res.googleSheetsConnected);
        }
      })
      .catch(() => {})
      .finally(() => {
        syncNow();
      });
  }, [syncNow]);

  // Adaptive Multi-Device Polling & Cross-Tab Broadcast Synchronization
  useEffect(() => {
    let intervalId: any;

    // Cross-tab broadcast channel for zero-latency multi-window updates
    const syncChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
      ? new BroadcastChannel('dkb_sync_bus')
      : null;

    if (syncChannel) {
      syncChannel.onmessage = (event) => {
        if (event.data === 'sync') {
          syncNow();
        }
      };
    }

    const setupInterval = () => {
      if (intervalId) clearInterval(intervalId);
      const isVisible = document.visibilityState === 'visible';
      // Fast 2s polling for active clients, 8s when in background
      const delay = isVisible ? 2000 : 8000;
      intervalId = setInterval(() => {
        syncNow();
      }, delay);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncNow(); // Immediate sync on focus
      }
      setupInterval();
    };

    const handleOnline = () => {
      showToast('Koneksi internet kembali normal. Menyinkronkan...', 'info');
      syncNow();
    };

    const handleOffline = () => {
      setSyncStatus('offline');
      showToast('Koneksi terputus. Mode offline aktif.', 'error');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setupInterval();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (syncChannel) syncChannel.close();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncNow, showToast]);

  // Locked menus are open without 30-minute expiration restriction

  // Auth Operations
  const loginDuty = async (password: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login_duty', password }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return {
          success: false,
          error: data.error || 'Password salah',
          remainingAttempts: data.details?.remainingAttempts,
          lockedForSeconds: data.details?.lockedForSeconds,
        };
      }

      // Decode payload
      const token = data.token;
      const base64Url = token.split('.')[1];
      const payload = JSON.parse(atob(base64Url));

      const newSession: AuthSession = {
        token,
        userId: payload.userId,
        role: payload.role,
        name: payload.name,
        label: payload.label,
      };

      setSession(newSession);
      localStorage.setItem('dkb_session', JSON.stringify(newSession));
      soundEffects.playSuccessBeep();
      setActiveTab('attendance'); // Direct to attendance as required in Bagian 3
      showToast('Berhasil masuk sebagai Petugas Piket.', 'success');
      return { success: true };
    } catch (e: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: e.message || 'Gagal menghubungi server' };
    }
  };

  const unlockHomeroom = async (name: string, password: string, classId?: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({ action: 'unlock_homeroom', name, password, classId }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      const token = data.token;
      const targetClassId = data.classId || classId || '10-RPL-1';
      const base64Url = token.split('.')[1];
      const payload = JSON.parse(atob(base64Url));

      const newSession: AuthSession = {
        token,
        userId: payload.userId || session?.userId || 'user_homeroom',
        role: payload.role || session?.role || 'homeroom',
        name: data.teacherName || payload.name || name,
        label: payload.label || session?.label || `Wali Kelas ${targetClassId}`,
        lockedMenuRole: 'homeroom',
        lockedMenuClassId: targetClassId,
      };

      setSession(newSession);
      localStorage.setItem('dkb_session', JSON.stringify(newSession));
      setActiveTab('homeroom');
      soundEffects.playSuccessBeep();
      showToast(`Akses Wali Kelas terbuka untuk ${data.teacherName || name} (Kelas ${targetClassId}).`, 'success');
      return { success: true, classId: targetClassId };
    } catch (e: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: e.message };
    }
  };

  const unlockStudentAffairs = async (password: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({ action: 'unlock_student_affairs', password }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      const token = data.token;
      const base64Url = token.split('.')[1];
      const payload = JSON.parse(atob(base64Url));

      const newSession: AuthSession = {
        token,
        userId: payload.userId || session?.userId || 'user_student_affairs',
        role: payload.role || session?.role || 'student_affairs',
        name: payload.name || session?.name || 'Bagian Kesiswaan',
        label: payload.label || session?.label || 'Tim Kesiswaan',
        lockedMenuRole: 'student_affairs',
      };

      setSession(newSession);
      localStorage.setItem('dkb_session', JSON.stringify(newSession));
      setActiveTab('student_affairs');
      soundEffects.playSuccessBeep();
      showToast('Akses Kesiswaan terbuka.', 'success');
      return { success: true };
    } catch (e: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: e.message };
    }
  };

  const unlockAdmin = async (password: string) => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({ action: 'unlock_admin', password }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      const token = data.token;
      const base64Url = token.split('.')[1];
      const payload = JSON.parse(atob(base64Url));

      const newSession: AuthSession = {
        token,
        userId: payload.userId || session?.userId || 'user_admin_main',
        role: payload.role || session?.role || 'admin',
        name: payload.name || session?.name || 'Administrator Sekolah',
        label: payload.label || session?.label || 'Admin Sistem',
        lockedMenuRole: 'admin',
      };

      setSession(newSession);
      localStorage.setItem('dkb_session', JSON.stringify(newSession));
      setActiveTab('admin');
      soundEffects.playSuccessBeep();
      showToast('Akses Administrator terbuka.', 'success');
      return { success: true };
    } catch (e: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: e.message };
    }
  };

  const lockCurrentMenu = () => {
    if (!session) return;
    const updated: AuthSession = {
      ...session,
      lockedMenuRole: undefined,
      lockedMenuClassId: undefined,
      lockedMenuExpiresAt: undefined,
    };
    setSession(updated);
    localStorage.setItem('dkb_session', JSON.stringify(updated));
    showToast('Menu berhasil dikunci kembali.', 'info');
    setActiveTab('attendance');
  };

  const logout = () => {
    setSession(null);
    localStorage.removeItem('dkb_session');
    showToast('Anda telah keluar dari aplikasi.', 'info');
  };

  const updateSessionToken = (newToken: string) => {
    try {
      const base64Url = newToken.split('.')[1];
      const payload = JSON.parse(atob(base64Url));
      setSession((prev) => {
        if (!prev) return null;
        const updated: AuthSession = {
          ...prev,
          token: newToken,
          userId: payload.userId || prev.userId,
          role: payload.role || prev.role,
          name: payload.name || prev.name,
        };
        localStorage.setItem('dkb_session', JSON.stringify(updated));
        return updated;
      });
    } catch (err) {
      console.error('Failed to update session token:', err);
    }
  };

  const toggleKioskFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsKioskFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsKioskFullscreen(false)).catch(() => {});
    }
  };

  // Google Workspace Integration Actions
  const connectGoogle = async (promptSelect: boolean = false) => {
    try {
      setGoogleSyncing(true);
      showToast('Membuka autentikasi Google...', 'info');
      const { user, accessToken, accountInfo } = await signInWithGoogle(promptSelect);
      setGoogleAccount(accountInfo);
      setGoogleSheetsConnected(true);

      showToast('Membuat folder database Google Drive & Spreadsheet otomatis...', 'info');

      // 1. Automatically find or create dedicated folder in Google Drive
      const folder = await getOrCreateDriveFolder(accessToken);

      // 2. Automatically find or create dedicated Spreadsheet inside folder
      const sheet = await getOrCreateSpreadsheet(accessToken, folder.folderId);

      // 3. Save IDs and URLs to app settings
      const nowIso = new Date().toISOString();
      await updateSettings({
        google_account_email: accountInfo.email,
        google_account_name: accountInfo.name,
        google_account_photo: accountInfo.photo,
        google_drive_folder_id: folder.folderId,
        google_drive_folder_url: folder.folderUrl,
        google_sheet_id: sheet.spreadsheetId,
        google_sheet_url: sheet.spreadsheetUrl,
        google_last_synced_at: nowIso,
      });

      // 4. Initial sync of all data into Google Sheets
      const syncRes = await syncAllDataToGoogleSheets(accessToken, sheet.spreadsheetId, {
        students,
        classes,
        sessions,
        attendance,
        outOfClass,
        violations,
        settings,
      });

      showToast(
        `Akun Google (${accountInfo.email}) terhubung! Folder & Google Spreadsheet berhasil dibuat (${syncRes.rowsUpdated} baris data disinkronkan).`,
        'success'
      );
      return { success: true };
    } catch (err: any) {
      console.error('[Google Connect Error]:', err);
      showToast(err.message || 'Gagal menghubungkan Akun Google', 'error');
      return { success: false, error: err.message };
    } finally {
      setGoogleSyncing(false);
    }
  };

  const disconnectGoogle = async () => {
    try {
      await disconnectGoogleAccount();
      setGoogleAccount(null);
      setGoogleSheetsConnected(false);
      await updateSettings({
        google_account_email: '',
        google_account_name: '',
        google_account_photo: '',
      });
      showToast('Akun Google berhasil diputuskan dari aplikasi.', 'info');
    } catch (err: any) {
      showToast(err.message || 'Gagal memutuskan akun Google', 'error');
    }
  };

  const syncGoogleSheetsNow = async () => {
    try {
      setGoogleSyncing(true);
      let token = await getAccessToken();
      if (!token) {
        showToast('Meminta otorisasi Google untuk sinkronisasi...', 'info');
        const res = await signInWithGoogle(false);
        token = res.accessToken;
        setGoogleAccount(res.accountInfo);
        setGoogleSheetsConnected(true);
      }

      let sheetId = settings.google_sheet_id;
      if (!sheetId) {
        const folder = await getOrCreateDriveFolder(token);
        const sheet = await getOrCreateSpreadsheet(token, folder.folderId);
        sheetId = sheet.spreadsheetId;
        await updateSettings({
          google_drive_folder_id: folder.folderId,
          google_drive_folder_url: folder.folderUrl,
          google_sheet_id: sheet.spreadsheetId,
          google_sheet_url: sheet.spreadsheetUrl,
        });
      }

      showToast('Mengirim seluruh data ke Google Sheets...', 'info');
      const syncRes = await syncAllDataToGoogleSheets(token, sheetId, {
        students,
        classes,
        sessions,
        attendance,
        outOfClass,
        violations,
        settings,
      });

      const nowIso = new Date().toISOString();
      await updateSettings({ google_last_synced_at: nowIso });
      showToast(
        `Sinkronisasi Google Sheets sukses! ${syncRes.rowsUpdated} baris data berhasil diperbarui.`,
        'success'
      );
      return { success: true, rowsUpdated: syncRes.rowsUpdated };
    } catch (err: any) {
      console.error('[Google Sync Error]:', err);
      showToast(err.message || 'Gagal sinkronisasi data ke Google Sheets', 'error');
      return { success: false, error: err.message };
    } finally {
      setGoogleSyncing(false);
    }
  };

  // Mutator Operations
  const recordAttendanceOffline = (params: {
    code?: string;
    studentId?: string;
    sessionId?: string;
    status?: string;
    notes?: string;
    method?: string;
  }) => {
    const rawCode = (params.code || params.studentId || '').trim();
    const matchedStudent = students.find(
      (s) =>
        s.nis === rawCode ||
        s.card_code === rawCode ||
        s.rfid_uid === rawCode ||
        s.nisn === rawCode
    );

    if (!matchedStudent) {
      soundEffects.playErrorBeep();
      return {
        success: false,
        error: `Kartu / NIS "${rawCode}" tidak terdaftar dalam database lokal perangkat.`,
      };
    }

    const todayStr = currentServerTime.toISOString().split('T')[0];
    const targetSessionId = params.sessionId || activeSession?.id || 'session_1';
    const alreadyAttended = attendance.some(
      (a) => a.student_id === matchedStudent.nis && a.date === todayStr && a.session_id === targetSessionId
    );

    if (alreadyAttended) {
      soundEffects.playErrorBeep();
      return {
        success: false,
        error: `Siswa ${matchedStudent.name} sudah tercatat presensi sesi ini.`,
        isDuplicate: true,
        student: matchedStudent,
      };
    }

    const nowH = currentServerTime.getHours();
    const nowM = currentServerTime.getMinutes();
    const curMins = nowH * 60 + nowM;
    let lateMins = 0;
    let finalStatus = params.status || 'Hadir';

    if (activeSession && activeSession.on_time_limit) {
      const [lh, lm] = activeSession.on_time_limit.split(':').map(Number);
      const limitMins = lh * 60 + lm;
      if (curMins > limitMins) {
        lateMins = curMins - limitMins;
        finalStatus = 'Terlambat';
      }
    }

    const nowIso = new Date().toISOString();
    const offlineRecord: AttendanceRecord = {
      id: `att_offline_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      student_id: matchedStudent.nis,
      session_id: targetSessionId,
      date: todayStr,
      timestamp: nowIso,
      status: finalStatus as any,
      late_minutes: lateMins,
      method: ((params.method as any) || 'rfid') as 'rfid' | 'barcode' | 'manual',
      device_id: 'offline_local_device',
      notes: params.notes || 'Presensi Tersimpan Offline (Siap Sinkron)',
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    };

    setAttendance((prev) => [offlineRecord, ...prev]);

    try {
      const rawQ = localStorage.getItem('dkb_offline_queue');
      const q = rawQ ? JSON.parse(rawQ) : [];
      q.push({ type: 'attendance', payload: params });
      localStorage.setItem('dkb_offline_queue', JSON.stringify(q));
    } catch {}

    soundEffects.playSuccessBeep();
    showToast(`Mode Offline: Presensi ${matchedStudent.name} berhasil disimpan lokal & akan otomatis disinkronkan saat online.`, 'info');
    return {
      success: true,
      record: offlineRecord,
      student: matchedStudent,
      session: activeSession || undefined,
    };
  };

  const recordAttendance = async (params: {
    code?: string;
    studentId?: string;
    sessionId?: string;
    status?: string;
    notes?: string;
    method?: string;
  }) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return recordAttendanceOffline(params);
    }

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return {
          success: false,
          error: data.error || 'Presensi gagal',
          isDuplicate: data.details?.isDuplicate,
          student: data.details?.student,
        };
      }

      soundEffects.playSuccessBeep();
      // Optimistic update
      setAttendance((prev) => [data.record, ...prev.filter((a) => a.id !== data.record.id)]);
      syncNow(); // Quick sync
      return {
        success: true,
        record: data.record,
        student: data.student,
        session: data.session,
      };
    } catch (err: any) {
      return recordAttendanceOffline(params);
    }
  };

  const updateAttendance = async (id: string, updates: Partial<AttendanceRecord>, reason: string) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id, updates, reason }),
      });
      if (res.ok) {
        showToast('Presensi berhasil diperbarui.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteAttendance = async (id: string, reason: string) => {
    try {
      const res = await fetch('/api/attendance', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id, reason }),
      });
      if (res.ok) {
        showToast('Presensi berhasil dibatalkan.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const startOutOfClass = async (
    studentId: string,
    type: 'BAK' | 'BAB' | 'Keperluan Lain',
    durationMinutes: number
  ) => {
    try {
      const res = await fetch('/api/out-of-class', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({
          studentId,
          type,
          durationMinutes,
          idempotencyKey: `ooc_${Date.now()}_${Math.random()}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      soundEffects.playSuccessBeep();
      setOutOfClass((prev) => [data.record, ...prev]);
      syncNow();
      return { success: true, record: data.record, student: data.student };
    } catch (err: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: err.message || 'Gagal memulai izin keluar.' };
    }
  };

  const confirmOutOfClassReturn = async (
    id: string,
    returnMethod: 'click' | 'manual' = 'click',
    notes?: string,
    auditReason?: string
  ) => {
    try {
      const res = await fetch('/api/out-of-class', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify({ id, returnMethod, notes, auditReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      soundEffects.playSuccessBeep();
      setOutOfClass((prev) => prev.map((o) => (o.id === id ? data.record : o)));
      syncNow();
      return { success: true, record: data.record };
    } catch (err: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: err.message };
    }
  };

  const recordViolation = async (params: {
    studentId: string;
    violationTypeId: string;
    customPoints?: number;
    notes?: string;
    location?: string;
    evidenceBase64?: string;
    evidenceFileName?: string;
  }) => {
    try {
      const res = await fetch('/api/violations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
        },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        soundEffects.playErrorBeep();
        return { success: false, error: data.error };
      }

      soundEffects.playSuccessBeep();
      setViolations((prev) => [data.violation, ...prev]);
      syncNow();
      return {
        success: true,
        violation: data.violation,
        studentTotalPoints: data.studentTotalPoints,
      };
    } catch (err: any) {
      soundEffects.playErrorBeep();
      return { success: false, error: err.message };
    }
  };

  const deleteViolation = async (id: string, reason: string) => {
    try {
      const res = await fetch('/api/violations', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id, reason }),
      });
      if (res.ok) {
        showToast('Catatan pelanggaran berhasil dihapus.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const saveStudent = async (student: Student) => {
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(student),
      });
      if (res.ok) {
        showToast('Data siswa berhasil disimpan.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteStudent = async (nis: string) => {
    try {
      const res = await fetch('/api/students', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ nis }),
      });
      if (res.ok) {
        showToast('Siswa berhasil dihapus.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const batchImportStudents = async (newStudents: Student[]) => {
    try {
      const res = await fetch('/api/students?action=batch_import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ students: newStudents }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(`Impor selesai: ${data.added} ditambahkan, ${data.updated} diperbarui.`, 'success');
        syncNow();
        return { success: true, added: data.added, updated: data.updated };
      }
      return { success: false, added: 0, updated: 0 };
    } catch {
      return { success: false, added: 0, updated: 0 };
    }
  };

  const saveClass = async (cls: SchoolClass) => {
    // 1. Instant optimistic state update
    setClasses((prev) => {
      const idx = prev.findIndex((c) => c.id === cls.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = cls;
        return copy;
      }
      return [...prev, cls];
    });
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(cls),
      });
      showToast('Kelas berhasil disimpan.', 'success');
      syncNow();
      return res.ok;
    } catch {
      syncNow();
      return false;
    }
  };

  const deleteClass = async (id: string) => {
    // 1. Instant optimistic state update - disappears on 1-click immediately!
    setClasses((prev) => prev.filter((c) => c.id !== id && c.id.toLowerCase() !== id.toLowerCase()));
    showToast('Kelas berhasil dihapus.', 'success');
    try {
      await fetch(`/api/classes?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id }),
      });
      syncNow();
      return true;
    } catch {
      syncNow();
      return false;
    }
  };

  const saveSession = async (sess: AttendanceSession) => {
    // 1. Instant optimistic state update
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === sess.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = sess;
        return copy;
      }
      return [...prev, sess];
    });
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(sess),
      });
      showToast('Sesi presensi berhasil disimpan.', 'success');
      syncNow();
      return res.ok;
    } catch {
      syncNow();
      return false;
    }
  };

  const deleteSession = async (id: string) => {
    // 1. Instant optimistic state update - disappears on 1-click immediately!
    setSessions((prev) => prev.filter((s) => s.id !== id && s.id.toLowerCase() !== id.toLowerCase()));
    showToast('Sesi presensi berhasil dihapus.', 'success');
    try {
      await fetch(`/api/sessions?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id }),
      });
      syncNow();
      return true;
    } catch {
      syncNow();
      return false;
    }
  };

  const saveViolationType = async (vt: ViolationType) => {
    try {
      const res = await fetch('/api/violation-types', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(vt),
      });
      if (res.ok) {
        showToast('Jenis pelanggaran berhasil disimpan.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const deleteViolationType = async (id: string) => {
    try {
      const res = await fetch('/api/violation-types', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        showToast('Jenis pelanggaran berhasil dihapus.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateSettings = async (updates: Partial<AppSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        showToast('Pengaturan aplikasi berhasil disimpan.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const updateNotificationSettings = async (updates: Partial<NotificationSettings>) => {
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        showToast('Pengaturan notifikasi berhasil diperbarui.', 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  const sendTestEmail = async (email: string) => {
    try {
      const res = await fetch('/api/notifications?action=test_email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ email }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message || 'Gagal mengirim email uji coba' };
    }
  };

  const sendWeeklyRecap = async (classId?: string) => {
    try {
      const res = await fetch('/api/notifications?action=send_weekly_recap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ classId }),
      });
      const data = await res.json();
      if (res.ok) {
        if (classId) {
          showToast(
            data.sent
              ? `Rekap mingguan berhasil dikirim ke ${data.recipient || 'email wali kelas'}.`
              : `Gagal kirim rekap: ${data.reason}`,
            data.sent ? 'success' : 'error'
          );
        } else {
          showToast(
            `Rekap mingguan diproses: ${data.sent} terkirim, ${data.skipped} dilewati (tanpa email), ${data.failed} gagal.`,
            data.sent > 0 ? 'success' : 'info'
          );
        }
        syncNow();
        return { success: true, message: 'Rekap berhasil diproses', ...data };
      }
      showToast(data.error || 'Gagal mengirim rekap mingguan', 'error');
      return { success: false, message: data.error || 'Gagal' };
    } catch (err: any) {
      showToast(err.message || 'Gagal mengirim rekap mingguan', 'error');
      return { success: false, message: err.message || 'Gagal mengirim rekap mingguan' };
    }
  };

  const approveLeaveRequest = async (id: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
    try {
      const res = await fetch('/api/leave-requests', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.token}`,
        },
        body: JSON.stringify({ id, status, rejectionReason }),
      });
      if (res.ok) {
        showToast(`Pengajuan izin berhasil di${status === 'approved' ? 'setujui' : 'tolak'}.`, 'success');
        syncNow();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <AppContext.Provider
      value={{
        session,
        activeTab,
        setActiveTab,
        syncStatus,
        lastSyncTime,
        currentServerTime,
        activeSession,
        isKioskFullscreen,
        toggleKioskFullscreen,
        settings,
        classes,
        sessions,
        students,
        violationTypes,
        attendance,
        outOfClass,
        violations,
        leaveRequests,
        notificationSettings,
        notificationLogs,
        auditLogs,
        serverVersion,
        googleSheetsConnected,
        googleAccount,
        googleSyncing,
        connectGoogle,
        disconnectGoogle,
        syncGoogleSheetsNow,
        loginDuty,
        unlockHomeroom,
        unlockStudentAffairs,
        unlockAdmin,
        lockCurrentMenu,
        logout,
        updateSessionToken,
        syncNow,
        recordAttendance,
        updateAttendance,
        deleteAttendance,
        startOutOfClass,
        confirmOutOfClassReturn,
        recordViolation,
        deleteViolation,
        saveStudent,
        deleteStudent,
        batchImportStudents,
        saveClass,
        deleteClass,
        saveSession,
        deleteSession,
        saveViolationType,
        deleteViolationType,
        updateSettings,
        updateNotificationSettings,
        sendTestEmail,
        sendWeeklyRecap,
        approveLeaveRequest,
        toasts,
        showToast,
        dismissToast,
        speak,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};
