import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Student,
  SchoolClass,
  AttendanceSession,
  AttendanceRecord,
  OutOfClassRecord,
  ViolationRecord,
  AppSettings,
} from '../types/index.js';

// Required Google Workspace scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const firebaseAuth = getAuth(app);

// In-memory token cache (Do NOT store in localStorage/sessionStorage!)
let inMemoryAccessToken: string | null = null;
let isSigningIn = false;

export interface ConnectedGoogleAccount {
  email: string;
  name: string;
  photo?: string;
  uid: string;
  connectedAt: string;
}

export const getAccessToken = async (): Promise<string | null> => {
  return inMemoryAccessToken;
};

export const hasValidGoogleToken = (): boolean => {
  return Boolean(inMemoryAccessToken);
};

export const initGoogleAuth = (
  onSuccess?: (user: User, token: string) => void,
  onFailure?: () => void
) => {
  return onAuthStateChanged(firebaseAuth, async (user: User | null) => {
    if (user && inMemoryAccessToken) {
      if (onSuccess) onSuccess(user, inMemoryAccessToken);
    } else if (!user) {
      inMemoryAccessToken = null;
      if (onFailure) onFailure();
    }
  });
};

/**
 * Sign in with Google using popup and requested Drive + Sheets scopes
 */
export const signInWithGoogle = async (
  promptSelectAccount: boolean = false
): Promise<{ user: User; accessToken: string; accountInfo: ConnectedGoogleAccount }> => {
  try {
    isSigningIn = true;
    const provider = new GoogleAuthProvider();
    SCOPES.forEach((scope) => provider.addScope(scope));

    if (promptSelectAccount) {
      provider.setCustomParameters({
        prompt: 'select_account',
      });
    }

    const result = await signInWithPopup(firebaseAuth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan Access Token Google dari otentikasi.');
    }

    inMemoryAccessToken = credential.accessToken;
    const accountInfo: ConnectedGoogleAccount = {
      email: result.user.email || '',
      name: result.user.displayName || result.user.email || 'Admin Google',
      photo: result.user.photoURL || undefined,
      uid: result.user.uid,
      connectedAt: new Date().toISOString(),
    };

    return {
      user: result.user,
      accessToken: inMemoryAccessToken,
      accountInfo,
    };
  } finally {
    isSigningIn = false;
  }
};

/**
 * Disconnect Google Account and clear in-memory token
 */
export const disconnectGoogleAccount = async () => {
  await signOut(firebaseAuth);
  inMemoryAccessToken = null;
};

// ==========================================
// GOOGLE DRIVE & GOOGLE SHEETS API UTILITIES
// ==========================================

const FOLDER_NAME = 'DISIPLIN KITA BISA - Database Sekolah';
const SPREADSHEET_NAME = 'Database Presensi & Kedisiplinan - DISIPLIN KITA BISA';

/**
 * Find or create dedicated Google Drive folder
 */
export const getOrCreateDriveFolder = async (
  accessToken: string
): Promise<{ folderId: string; folderUrl: string }> => {
  // 1. Search existing folder
  const query = encodeURIComponent(`name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,webViewLink)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!searchRes.ok) {
    const err = await searchRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal mencari folder di Google Drive (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    const existing = searchData.files[0];
    return {
      folderId: existing.id,
      folderUrl: existing.webViewLink || `https://drive.google.com/drive/folders/${existing.id}`,
    };
  }

  // 2. Create folder if not found
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Folder basis data otomatis DISIPLIN KITA BISA (Presensi, Siswa, Rekapitulasi)',
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat folder di Google Drive (${createRes.status})`);
  }

  const newFolder = await createRes.json();
  return {
    folderId: newFolder.id,
    folderUrl: newFolder.webViewLink || `https://drive.google.com/drive/folders/${newFolder.id}`,
  };
};

/**
 * Find or create dedicated Google Spreadsheet in the app's Drive folder
 */
export const getOrCreateSpreadsheet = async (
  accessToken: string,
  folderId?: string
): Promise<{ spreadsheetId: string; spreadsheetUrl: string; isNew: boolean }> => {
  // 1. Search existing spreadsheet
  let query = `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
  if (folderId) {
    query += ` and '${folderId}' in parents`;
  }
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) {
      const existing = searchData.files[0];
      return {
        spreadsheetId: existing.id,
        spreadsheetUrl: existing.webViewLink || `https://docs.google.com/spreadsheets/d/${existing.id}/edit`,
        isNew: false,
      };
    }
  }

  // 2. Create spreadsheet with default sheets
  const sheetTitles = ['Siswa', 'Kelas', 'Sesi_Presensi', 'Presensi', 'Izin_Keluar', 'Pelanggaran', 'Pengaturan'];
  const createSheetRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        title: SPREADSHEET_NAME,
      },
      sheets: sheetTitles.map((title) => ({
        properties: {
          title,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
      })),
    }),
  });

  if (!createSheetRes.ok) {
    const err = await createSheetRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal membuat spreadsheet Google (${createSheetRes.status})`);
  }

  const sheetData = await createSheetRes.json();
  const spreadsheetId = sheetData.spreadsheetId;
  const spreadsheetUrl = sheetData.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  // 3. If folderId provided, move spreadsheet into folder
  if (folderId) {
    try {
      await fetch(
        `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
    } catch (e) {
      console.warn('[Google Workspace] Could not move spreadsheet into folder:', e);
    }
  }

  return {
    spreadsheetId,
    spreadsheetUrl,
    isNew: true,
  };
};

export interface SyncDataPayload {
  students: Student[];
  classes: SchoolClass[];
  sessions: AttendanceSession[];
  attendance: AttendanceRecord[];
  outOfClass: OutOfClassRecord[];
  violations: ViolationRecord[];
  settings: AppSettings;
}

/**
 * Synchronize all tables into Google Sheets
 */
export const syncAllDataToGoogleSheets = async (
  accessToken: string,
  spreadsheetId: string,
  data: SyncDataPayload
): Promise<{ success: boolean; rowsUpdated: number }> => {
  // Ensure the sheets exist in spreadsheet
  const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!metaRes.ok) {
    const err = await metaRes.json().catch(() => ({}));
    throw new Error(err.error?.message || 'Gagal membaca metadata Google Spreadsheet.');
  }

  const metaData = await metaRes.json();
  const existingSheetTitles: string[] = (metaData.sheets || []).map((s: any) => s.properties?.title);

  const requiredSheets = ['Siswa', 'Kelas', 'Sesi_Presensi', 'Presensi', 'Izin_Keluar', 'Pelanggaran', 'Pengaturan'];
  const missingSheets = requiredSheets.filter((title) => !existingSheetTitles.includes(title));

  if (missingSheets.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: missingSheets.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: { frozenRowCount: 1 },
            },
          },
        })),
      }),
    });
  }

  // 1. Format Siswa rows
  const siswaRows = [
    ['NIS', 'Nama Siswa', 'Kelas', 'Jenis Kelamin', 'RFID UID', 'Kode Kartu/NIS', 'Nama Orang Tua', 'Email Orang Tua', 'Status Keaktifan'],
    ...data.students.map((s) => [
      s.nis,
      s.name,
      s.class_id,
      s.gender === 'L' ? 'Laki-laki' : 'Perempuan',
      s.rfid_uid || '-',
      s.card_code || s.nis,
      s.parent_name || '-',
      s.parent_email || '-',
      s.nis ? 'Aktif' : 'Nonaktif',
    ]),
  ];

  // 2. Format Kelas rows
  const kelasRows = [
    ['ID Kelas', 'Nama Kelas', 'Tingkat', 'Jurusan', 'Nama Wali Kelas', 'Email Wali Kelas (Notifikasi Otomatis)'],
    ...data.classes.map((c) => [
      c.id,
      c.name,
      c.grade,
      c.major,
      c.homeroom_teacher_name || '-',
      c.homeroom_teacher_email || '-',
    ]),
  ];

  // 3. Format Sesi rows
  const sesiRows = [
    ['ID Sesi', 'Nama Sesi', 'Jam Mulai', 'Batas Tepat Waktu', 'Jam Selesai', 'Toleransi Terlambat (Menit)', 'Hari Aktif (0=Min,1=Sen..)', 'Status'],
    ...data.sessions.map((sess) => [
      sess.id,
      sess.name,
      sess.start_time,
      sess.on_time_limit,
      sess.end_time,
      sess.late_tolerance_minutes,
      (sess.active_days || [1, 2, 3, 4, 5]).join(', '),
      sess.is_active ? 'Aktif' : 'Nonaktif',
    ]),
  ];

  // 4. Format Presensi rows (most recent first)
  const studentMap = new Map(data.students.map((s) => [s.nis, s]));
  const presensiRows = [
    ['ID Presensi', 'Tanggal', 'Jam Pemindaian', 'NIS', 'Nama Siswa', 'Kelas', 'ID Sesi', 'Status Kehadiran', 'Terlambat (Menit)', 'Metode Scan', 'ID Perangkat', 'Catatan'],
    ...data.attendance.slice(0, 1500).map((a) => {
      const student = studentMap.get(a.student_id);
      return [
        a.id,
        a.date,
        a.timestamp ? new Date(a.timestamp).toLocaleTimeString('id-ID') : '-',
        a.student_id,
        student?.name || '-',
        student?.class_id || '-',
        a.session_id,
        a.status,
        a.late_minutes || 0,
        a.method || 'rfid',
        a.device_id || 'utama',
        a.notes || '',
      ];
    }),
  ];

  // 5. Format Izin Keluar rows
  const izinRows = [
    ['ID Izin', 'NIS', 'Nama Siswa', 'Kelas', 'Jenis Izin', 'Waktu Mulai', 'Batas Waktu', 'Waktu Kembali', 'Durasi (Menit)', 'Terlambat (Menit)', 'Status Izin', 'Metode Kembali', 'Catatan'],
    ...data.outOfClass.slice(0, 1000).map((o) => {
      const student = studentMap.get(o.student_id);
      return [
        o.id,
        o.student_id,
        student?.name || '-',
        o.class_id,
        o.type,
        new Date(o.started_at).toLocaleString('id-ID'),
        new Date(o.due_at).toLocaleTimeString('id-ID'),
        o.returned_at ? new Date(o.returned_at).toLocaleTimeString('id-ID') : '-',
        o.duration_minutes,
        o.late_return_minutes || 0,
        o.status,
        o.return_method || '-',
        o.return_notes || '',
      ];
    }),
  ];

  // 6. Format Pelanggaran rows
  const pelanggaranRows = [
    ['ID Pelanggaran', 'Tanggal & Waktu', 'NIS', 'Nama Siswa', 'Kelas', 'Jenis Pelanggaran', 'Kategori', 'Poin', 'Lokasi Kejadian', 'Petugas Pencatat', 'Keterangan'],
    ...data.violations.slice(0, 1000).map((v) => {
      const student = studentMap.get(v.student_id);
      return [
        v.id,
        new Date(v.recorded_at).toLocaleString('id-ID'),
        v.student_id,
        student?.name || '-',
        v.class_id,
        v.type_name,
        v.category,
        v.points,
        v.location || '-',
        v.recorded_by || 'Admin',
        v.notes || '',
      ];
    }),
  ];

  // 7. Format Pengaturan & Status
  const pengaturanRows = [
    ['Parameter Sistem', 'Nilai Saat Ini', 'Keterangan'],
    ['Nama Sekolah', data.settings.school_name, 'Nama identitas resmi sekolah'],
    ['Total Siswa Terdaftar', String(data.students.length), 'Jumlah siswa aktif & terdaftar'],
    ['Total Kelas', String(data.classes.length), 'Jumlah rombel kelas'],
    ['Total Catatan Presensi', String(data.attendance.length), 'Presensi tercatat di sistem'],
    ['Sinkron Terakhir', new Date().toLocaleString('id-ID'), 'Waktu sinkronisasi cloud real-time'],
    ['Mode Database', 'Google Sheets & Drive Terintegrasi', 'Database real-time cloud multi-device'],
  ];

  // Clear existing ranges then batch write
  const clearRanges = requiredSheets.map((title) => `${title}!A:Z`);
  await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ranges: clearRanges }),
  });

  // Batch update values
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Siswa!A1', values: siswaRows },
          { range: 'Kelas!A1', values: kelasRows },
          { range: 'Sesi_Presensi!A1', values: sesiRows },
          { range: 'Presensi!A1', values: presensiRows },
          { range: 'Izin_Keluar!A1', values: izinRows },
          { range: 'Pelanggaran!A1', values: pelanggaranRows },
          { range: 'Pengaturan!A1', values: pengaturanRows },
        ],
      }),
    }
  );

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(err.error?.message || `Gagal menulis data ke Google Sheets (${writeRes.status})`);
  }

  const result = await writeRes.json();
  return {
    success: true,
    rowsUpdated: result.totalUpdatedRows || siswaRows.length + presensiRows.length,
  };
};
