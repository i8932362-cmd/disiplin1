import { storage } from './storage.js';
import { authService } from './auth.js';
import { notificationService } from './emailer.js';
import { googleSheetsClient } from './sheets.js';
import * as XLSX from 'xlsx';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

function sanitizePayloadForSigning(obj: Record<string, any>): Record<string, any> {
  const copy = { ...obj };
  delete copy.exp;
  delete copy.iat;
  delete copy.nbf;
  delete copy.jti;
  return copy;
}

export interface ApiRequest {
  method: string;
  url: string;
  query: Record<string, string>;
  body: any;
  headers: Record<string, string | undefined>;
}

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
}

export class JsonResponse {
  static ok(data: any, headers?: Record<string, string>): ApiResponse {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: data,
    };
  }

  static badRequest(message: string, details?: any): ApiResponse {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: message, details },
    };
  }

  static unauthorized(message = 'Unauthorized'): ApiResponse {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: message },
    };
  }

  static forbidden(message = 'Forbidden'): ApiResponse {
    return {
      statusCode: 403,
      headers: { 'Content-Type': 'application/json' },
      body: { error: message },
    };
  }

  static notFound(message = 'Not Found'): ApiResponse {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: message },
    };
  }

  static serverError(err: any): ApiResponse {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: err?.message || 'Internal Server Error' },
    };
  }
}

/**
 * Main API Handler routing requests based on path
 */
export async function handleApiRoute(req: ApiRequest): Promise<ApiResponse> {
  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // Extract query parameters
  const query: Record<string, string> = { ...req.query };
  urlObj.searchParams.forEach((val, key) => {
    query[key] = val;
  });

  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';

  try {
    // 1. SETUP: /api/setup
    if (pathname === '/api/setup') {
      const fullSnapshot = await storage.getFullSnapshot();
      return JsonResponse.ok({
        success: true,
        message: 'Sistem dan basis data berhasil diinisialisasi.',
        googleSheetsConnected: storage.isSheetsConnected(),
        version: fullSnapshot.version,
      });
    }

    // 2. AUTH: /api/auth
    if (pathname === '/api/auth') {
      const action = query.action || req.body?.action;

      if (action === 'login_duty') {
        const password = req.body?.password;
        if (!password) return JsonResponse.badRequest('Password wajib diisi.');
        const result = await authService.loginDuty(password, req.headers['x-forwarded-for'] || 'client');
        if (!result.success) return JsonResponse.badRequest(result.error || 'Password salah', result);
        return JsonResponse.ok(result);
      }

      if (action === 'unlock_homeroom') {
        const { name, password, classId } = req.body || {};
        if (!name || !password) return JsonResponse.badRequest('Nama dan password wali kelas wajib diisi.');
        const result = await authService.unlockHomeroom(name, password, classId, token);
        if (!result.success) return JsonResponse.badRequest(result.error || 'Gagal membuka akses wali kelas');
        return JsonResponse.ok(result);
      }

      if (action === 'unlock_student_affairs') {
        const password = req.body?.password;
        if (!password) return JsonResponse.badRequest('Password wajib diisi.');
        const result = await authService.unlockStudentAffairs(password, token);
        if (!result.success) return JsonResponse.badRequest(result.error || 'Password kesiswaan salah');
        return JsonResponse.ok(result);
      }

      if (action === 'unlock_admin') {
        const password = req.body?.password;
        if (!password) return JsonResponse.badRequest('Password admin wajib diisi.');
        const result = await authService.unlockAdmin(password, token);
        if (!result.success) return JsonResponse.badRequest(result.error || 'Password admin salah');
        return JsonResponse.ok(result);
      }

      if (action === 'verify_session') {
        if (!token) return JsonResponse.unauthorized();
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid) return JsonResponse.unauthorized(validRes.reason);
        return JsonResponse.ok({ valid: true, session: validRes.session });
      }

      // Password Management (Admin / Authorized)
      if (action === 'manage_accounts') {
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid || !validRes.session) {
          return JsonResponse.unauthorized('Sesi tidak valid atau telah berakhir.');
        }

        if (method === 'GET') {
          const users = await storage.getUsers();
          // Hide password hashes
          const safeUsers = users.map((u) => ({
            id: u.id,
            role: u.role,
            name: u.name,
            class_id: u.class_id,
            label: u.label,
            token_version: u.token_version,
            is_active: u.is_active,
            created_at: u.created_at,
          }));
          return JsonResponse.ok({ users: safeUsers });
        }

        if (method === 'POST') {
          const { user, newPassword, targetUserId } = req.body;

          // Direct password change for any specific user (Duty, Homeroom, Student Affairs, or Admin)
          if (targetUserId && newPassword) {
            if (newPassword.trim().length < 4) {
              return JsonResponse.badRequest('Password baru minimal 4 karakter.');
            }
            const users = await storage.getUsers();
            const target = users.find((u) => u.id === targetUserId);
            if (!target) return JsonResponse.notFound('Akun tidak ditemukan.');

            const oldRecord = { ...target };
            target.password_hash = bcrypt.hashSync(newPassword.trim(), 10);
            target.token_version = (target.token_version || 1) + 1;
            target.updated_at = new Date().toISOString();

            await storage.saveUser(target);
            await storage.logAudit(
              validRes.session.name,
              'admin',
              'update_password',
              'users',
              target.id,
              undefined,
              undefined,
              `Admin mengubah password untuk akun: ${target.name} (${target.role})`
            );

            let refreshedToken: string | undefined = undefined;
            if (validRes.session.userId === target.id) {
              const JWT_SECRET = process.env.JWT_SECRET || 'disiplin-kita-bisa-secure-secret-key-2026';
              refreshedToken = jwt.sign(
                sanitizePayloadForSigning({
                  ...validRes.session,
                  tokenVersion: target.token_version,
                }),
                JWT_SECRET,
                { expiresIn: '12h' }
              );
            }

            return JsonResponse.ok({ success: true, user: target, refreshedToken });
          }

          if (!user || !user.id || !user.role || !user.name) {
            return JsonResponse.badRequest('Data akun tidak lengkap.');
          }
          const users = await storage.getUsers();
          const existing = users.find((u) => u.id === user.id);

          if (!existing && (!newPassword || newPassword.trim().length < 4)) {
            return JsonResponse.badRequest('Password minimal 4 karakter untuk akun baru.');
          }

          let passwordHash = existing?.password_hash || '';
          let tokenVersion = (existing?.token_version || 1);

          if (newPassword && newPassword.trim().length >= 4) {
            passwordHash = bcrypt.hashSync(newPassword.trim(), 10);
            tokenVersion += 1; // Invalidate all prior active sessions on other devices!
          }

          const updatedUser = {
            ...user,
            password_hash: passwordHash,
            token_version: tokenVersion,
            updated_at: new Date().toISOString(),
          };

          await storage.saveUser(updatedUser);
          await storage.logAudit(
            validRes.session.name,
            'admin',
            existing ? 'update' : 'create',
            'users',
            updatedUser.id,
            existing ? JSON.stringify(existing) : undefined,
            JSON.stringify(updatedUser),
            `Perubahan akun/password untuk ${updatedUser.name} (${updatedUser.role})`
          );

          let refreshedToken: string | undefined = undefined;
          if (validRes.session.userId === updatedUser.id && newPassword && newPassword.trim().length >= 4) {
            const JWT_SECRET = process.env.JWT_SECRET || 'disiplin-kita-bisa-secure-secret-key-2026';
            refreshedToken = jwt.sign(
              sanitizePayloadForSigning({
                ...validRes.session,
                tokenVersion: updatedUser.token_version,
              }),
              JWT_SECRET,
              { expiresIn: '12h' }
            );
          }

          return JsonResponse.ok({ success: true, user: updatedUser, refreshedToken });
        }

        if (method === 'DELETE') {
          const { id } = req.body;
          if (id === 'user_admin_main') {
            return JsonResponse.badRequest('Akun admin utama tidak boleh dihapus.');
          }
          await storage.deleteUser(id);
          return JsonResponse.ok({ success: true });
        }
      }

      return JsonResponse.badRequest('Aksi auth tidak dikenali.');
    }

    // 3. SYNC: /api/sync?since=<version>
    // Bagian 13 Poin 2 & 3: Cache-Control: public, s-maxage=2, stale-while-revalidate=5
    if (pathname === '/api/sync') {
      const sinceVer = parseInt(query.since || '0', 10);
      const syncResult = await storage.getSyncData(sinceVer);
      return JsonResponse.ok(syncResult, {
        'Cache-Control': 'public, s-maxage=2, stale-while-revalidate=5',
      });
    }

    // 4. ATTENDANCE: /api/attendance
    if (pathname === '/api/attendance') {
      if (method === 'GET') {
        const records = await storage.getAttendance();
        return JsonResponse.ok({ records });
      }

      if (method === 'POST') {
        // Record attendance (RFID scan, Barcode scan, or Manual input)
        const { code, studentId, sessionId, status, notes, method: attMethod, deviceId } = req.body;

        let student = null;
        if (code) {
          student = await storage.findStudentByCode(code);
        } else if (studentId) {
          const students = await storage.getStudents();
          student = students.find((s) => s.nis === studentId);
        }

        if (!student) {
          return JsonResponse.badRequest('Kartu atau NIS tidak terdaftar dalam database siswa.');
        }

        // Determine session
        const sessions = await storage.getSessions();
        let session = sessions.find((s) => s.id === sessionId && s.is_active);

        const now = new Date();
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentDateStr = now.toISOString().split('T')[0];

        if (!session) {
          // Find currently active session by time
          session = sessions.find((s) => {
            if (!s.is_active) return false;
            return currentTimeStr >= s.start_time && currentTimeStr <= s.end_time;
          });
        }

        // If no session matches exact time window, fallback gracefully to active session or first session
        if (!session) {
          session = sessions.find((s) => s.is_active) || sessions[0];
        }

        const activeSession = session || sessions[0];

        // Check if student is on leave or sick today
        const leaveRequests = await storage.getLeaveRequests();
        const activeLeave = leaveRequests.find(
          (l) =>
            l.student_id === student!.nis &&
            l.status === 'approved' &&
            currentDateStr >= l.start_date &&
            currentDateStr <= l.end_date
        );

        if (activeLeave && !status) {
          return JsonResponse.badRequest(
            `Siswa berstatus ${activeLeave.type.toUpperCase()} hari ini: ${activeLeave.reason}`
          );
        }

        // Determine attendance status & late minutes
        let attStatus = status || 'Hadir';
        let lateMinutes = 0;

        if (!status) {
          // Automatic status based on session on_time_limit
          if (currentTimeStr > activeSession.on_time_limit) {
            const [limitH, limitM] = activeSession.on_time_limit.split(':').map(Number);
            const [currH, currM] = currentTimeStr.split(':').map(Number);
            const diffMinutes = (currH * 60 + currM) - (limitH * 60 + limitM);

            if (diffMinutes > 0) {
              lateMinutes = diffMinutes;
              attStatus = 'Terlambat';
            }
          }
        }

        const recordId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const record = {
          id: recordId,
          student_id: student.nis,
          session_id: activeSession.id,
          date: currentDateStr,
          timestamp: now.toISOString(),
          status: attStatus,
          late_minutes: lateMinutes,
          method: attMethod || (code?.startsWith('RFID-') ? 'rfid' : 'barcode'),
          device_id: deviceId || 'kiosk_main',
          notes: notes || '',
          version: 1,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        };

        const result = await storage.recordAttendance(record);
        if (!result.success) {
          return JsonResponse.badRequest(result.message || 'Presensi gagal disimpan', {
            isDuplicate: result.isDuplicate,
            student,
          });
        }

        // Parent email notification if late or alpha
        if (attStatus === 'Terlambat' || attStatus === 'Alpha') {
          notificationService.notifyParent({
            student,
            triggerType: attStatus === 'Terlambat' ? 'terlambat' : 'alpha',
            status: `${attStatus} (${lateMinutes} menit)` ,
          }).catch(console.error);
        }

        return JsonResponse.ok({
          success: true,
          record: result.record,
          student,
          session: activeSession,
        });
      }

      if (method === 'PUT') {
        const { id, updates, reason } = req.body;
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid) return JsonResponse.unauthorized();
        const updated = await storage.updateAttendance(id, updates, validRes.session?.name || 'Petugas', reason || 'Koreksi presensi');
        return JsonResponse.ok({ success: true, record: updated });
      }

      if (method === 'DELETE') {
        const { id, reason } = req.body;
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid) return JsonResponse.unauthorized();
        const success = await storage.deleteAttendance(id, validRes.session?.name || 'Petugas', reason || 'Pembatalan presensi');
        return JsonResponse.ok({ success });
      }
    }

    // 5. OUT OF CLASS: /api/out-of-class
    if (pathname === '/api/out-of-class') {
      if (method === 'GET') {
        // Auto-close overdue permissions that expired long ago
        await storage.autoCloseOverdueOutOfClass();
        const records = await storage.getOutOfClass();
        return JsonResponse.ok({ records });
      }

      if (method === 'POST') {
        const { studentId, type, durationMinutes, idempotencyKey } = req.body;
        if (!studentId || !type || !durationMinutes) {
          return JsonResponse.badRequest('Data izin keluar tidak lengkap.');
        }

        const students = await storage.getStudents();
        const student = students.find((s) => s.nis === studentId);
        if (!student) {
          return JsonResponse.badRequest('Siswa tidak ditemukan.');
        }

        const now = new Date();
        const due = new Date(now.getTime() + durationMinutes * 60 * 1000);

        const newRecord = {
          id: `ooc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          student_id: student.nis,
          class_id: student.class_id,
          type,
          duration_minutes: durationMinutes,
          started_at: now.toISOString(),
          due_at: due.toISOString(),
          late_return_minutes: 0,
          status: 'active' as const,
          idempotency_key: idempotencyKey || `key_${Date.now()}`,
          version: 1,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        };

        const result = await storage.startOutOfClass(newRecord);
        if (!result.success) {
          return JsonResponse.badRequest(result.error || 'Gagal memulai izin keluar.');
        }

        return JsonResponse.ok({ success: true, record: result.record, student });
      }

      if (method === 'PUT') {
        // Confirm return (click checkmark)
        const { id, returnMethod, notes, auditReason } = req.body;
        const validRes = await authService.validateActiveSession(token);
        const result = await storage.confirmOutOfClassReturn(
          id,
          returnMethod || 'click',
          notes,
          validRes.valid ? validRes.session?.name : 'Petugas Piket',
          auditReason
        );

        if (!result.success) {
          return JsonResponse.badRequest(result.error || 'Gagal mengonfirmasi kepulangan.');
        }

        // If returned late, notify parent
        if (result.record && result.record.late_return_minutes > 0) {
          const students = await storage.getStudents();
          const student = students.find((s) => s.nis === result.record!.student_id);
          if (student) {
            notificationService.notifyParent({
              student,
              triggerType: 'melebihi_waktu',
              status: `Melebihi Waktu Izin Keluar (+${result.record.late_return_minutes} menit)`,
              lateReturnMinutes: result.record.late_return_minutes,
            }).catch(console.error);
          }
        }

        return JsonResponse.ok({
          success: true,
          alreadyReturned: result.alreadyReturned,
          record: result.record,
        });
      }
    }

    // 6. VIOLATIONS: /api/violations
    if (pathname === '/api/violations') {
      if (method === 'GET') {
        const violations = await storage.getViolations();
        const types = await storage.getViolationTypes();
        return JsonResponse.ok({ violations, types });
      }

      if (method === 'POST') {
        const {
          studentId,
          violationTypeId,
          customPoints,
          notes,
          location,
          evidenceBase64,
          evidenceFileName,
        } = req.body;

        const students = await storage.getStudents();
        const student = students.find((s) => s.nis === studentId);
        if (!student) return JsonResponse.badRequest('Siswa tidak ditemukan.');

        const types = await storage.getViolationTypes();
        const vtype = types.find((t) => t.id === violationTypeId);
        if (!vtype) return JsonResponse.badRequest('Jenis pelanggaran tidak valid.');

        let evidencePhotoUrl = '';
        if (evidenceBase64 && evidenceFileName) {
          if (googleSheetsClient.isConnected) {
            try {
              evidencePhotoUrl = await googleSheetsClient.uploadFileToDrive(
                `bukti_${student.nis}_${Date.now()}.jpg`,
                'image/jpeg',
                evidenceBase64
              );
            } catch (err) {
              console.warn('[Drive] Upload failed, falling back to data URL:', err);
              evidencePhotoUrl = `data:image/jpeg;base64,${evidenceBase64}`;
            }
          } else {
            evidencePhotoUrl = `data:image/jpeg;base64,${evidenceBase64}`;
          }
        }

        const validRes = await authService.validateActiveSession(token);
        const recordedBy = validRes.valid ? validRes.session?.name || 'Petugas' : 'Petugas';

        const record = {
          id: `vio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          student_id: student.nis,
          class_id: student.class_id,
          violation_type_id: vtype.id,
          type_name: vtype.name,
          category: vtype.category,
          points: customPoints !== undefined ? Number(customPoints) : vtype.default_points,
          notes: notes || '',
          location: location || '',
          evidence_photo_url: evidencePhotoUrl,
          recorded_by: recordedBy,
          recorded_at: new Date().toISOString(),
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const saved = await storage.recordViolation(record);

        // Calculate student total points
        const allVios = await storage.getViolations();
        const studentVios = allVios.filter((v) => v.student_id === student.nis);
        const totalPoints = studentVios.reduce((acc, curr) => acc + (curr.category === 'prestasi' ? -curr.points : curr.points), 0);

        // Notify parent
        notificationService.notifyParent({
          student,
          triggerType: 'pelanggaran',
          status: `Pelanggaran: ${vtype.name}`,
          violationName: vtype.name,
          points: record.points,
        }).catch(console.error);

        return JsonResponse.ok({
          success: true,
          violation: saved,
          studentTotalPoints: totalPoints,
        });
      }

      if (method === 'DELETE') {
        const { id, reason } = req.body;
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid) return JsonResponse.unauthorized();
        const success = await storage.deleteViolation(id, validRes.session?.name || 'Admin', reason || 'Koreksi pelanggaran');
        return JsonResponse.ok({ success });
      }
    }

    // 7. VIOLATION TYPES CRUD: /api/violation-types
    if (pathname === '/api/violation-types') {
      if (method === 'GET') {
        const types = await storage.getViolationTypes();
        return JsonResponse.ok({ types });
      }

      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }

      if (method === 'POST') {
        const vtype = req.body;
        if (!vtype.name || !vtype.code || !vtype.category) {
          return JsonResponse.badRequest('Nama, kode, dan kategori wajib diisi.');
        }
        if (!vtype.id) {
          vtype.id = `vt_${Date.now()}`;
        }
        const saved = await storage.saveViolationType(vtype);
        return JsonResponse.ok({ success: true, violationType: saved });
      }

      if (method === 'DELETE') {
        const { id } = req.body;
        await storage.deleteViolationType(id);
        return JsonResponse.ok({ success: true });
      }
    }

    // 8. STUDENTS: /api/students (CRUD, Excel Template, Excel Import/Export)
    if (pathname === '/api/students') {
      if (method === 'GET') {
        const students = await storage.getStudents();
        const action = query.action;

        // Download Template (.xlsx)
        if (action === 'template') {
          const classes = await storage.getClasses();
          const classNames = classes.map((c) => c.id).join(', ');

          const wb = XLSX.utils.book_new();
          const sampleData = [
            {
              NIS: '20261011',
              NISN: '0081234011',
              Nama: 'Muhammad Faiz',
              Kelas: classes[0]?.id || '10-RPL-1',
              Jenis_Kelamin: 'L',
              UID_RFID: 'RFID-8821911',
              Nama_Orang_Tua: 'Bambang Faiz',
              Email_Orang_Tua: 'faiz.parent@example.com',
            },
            {
              NIS: '20261012',
              NISN: '0081234012',
              Nama: 'Nadia Putri',
              Kelas: classes[0]?.id || '10-RPL-1',
              Jenis_Kelamin: 'P',
              UID_RFID: 'RFID-8821912',
              Nama_Orang_Tua: 'Rudi Hermanto',
              Email_Orang_Tua: 'nadia.parent@example.com',
            },
          ];

          const wsData = XLSX.utils.json_to_sheet(sampleData);
          XLSX.utils.book_append_sheet(wb, wsData, 'Data Siswa');

          // Sheet Petunjuk
          const instructions = [
            { Kolom: 'NIS', Keterangan: 'Nomor Induk Siswa (Wajib, Unik, angka/teks)', Contoh: '20261011' },
            { Kolom: 'NISN', Keterangan: 'Nomor Induk Siswa Nasional (Opsional)', Contoh: '0081234011' },
            { Kolom: 'Nama', Keterangan: 'Nama Lengkap Siswa (Wajib)', Contoh: 'Muhammad Faiz' },
            { Kolom: 'Kelas', Keterangan: `ID Kelas terdaftar (${classNames})`, Contoh: classes[0]?.id || '10-RPL-1' },
            { Kolom: 'Jenis_Kelamin', Keterangan: 'L (Laki-laki) atau P (Perempuan)', Contoh: 'L' },
            { Kolom: 'UID_RFID', Keterangan: 'Kode UID kartu RFID / Barcode (Wajib unik)', Contoh: 'RFID-8821911' },
            { Kolom: 'Nama_Orang_Tua', Keterangan: 'Nama Orang Tua / Wali', Contoh: 'Bambang Faiz' },
            { Kolom: 'Email_Orang_Tua', Keterangan: 'Alamat email aktif untuk notifikasi presensi & kedisiplinan', Contoh: 'faiz.parent@example.com' },
          ];
          const wsInstructions = XLSX.utils.json_to_sheet(instructions);
          XLSX.utils.book_append_sheet(wb, wsInstructions, 'Petunjuk Format');

          const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Disposition': 'attachment; filename="template_siswa_disiplin_kita_bisa.xlsx"',
            },
            body: buf,
          };
        }

        return JsonResponse.ok({ students });
      }

      // Check authorization for write operations
      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }

      if (method === 'POST') {
        const action = query.action;

        // Batch import students
        if (action === 'batch_import') {
          const { students: incomingStudents } = req.body;
          if (!Array.isArray(incomingStudents) || incomingStudents.length === 0) {
            return JsonResponse.badRequest('Daftar siswa kosong.');
          }

          const result = await storage.batchSaveStudents(incomingStudents);
          return JsonResponse.ok({ success: true, ...result });
        }

        const student = req.body;
        if (!student.nis || !student.name || !student.class_id) {
          return JsonResponse.badRequest('NIS, Nama, dan Kelas wajib diisi.');
        }
        const saved = await storage.saveStudent(student);
        return JsonResponse.ok({ success: true, student: saved });
      }

      if (method === 'DELETE') {
        const { nis } = req.body;
        const success = await storage.deleteStudent(nis);
        return JsonResponse.ok({ success });
      }
    }

    // 9. CLASSES & SESSIONS CRUD: /api/classes, /api/sessions
    if (pathname === '/api/classes') {
      if (method === 'GET') {
        const classes = await storage.getClasses();
        return JsonResponse.ok({ classes });
      }
      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }
      if (method === 'POST') {
        const cls = await storage.saveClass(req.body);

        // Sync with homeroom user if exists
        try {
          const users = await storage.getUsers();
          const homeroomUser = users.find((u) => u.role === 'homeroom' && u.class_id === cls.id);
          if (homeroomUser) {
            let changed = false;
            if (cls.homeroom_teacher_name && homeroomUser.name !== cls.homeroom_teacher_name) {
              homeroomUser.name = cls.homeroom_teacher_name;
              changed = true;
            }
            if (cls.homeroom_teacher_email && homeroomUser.email !== cls.homeroom_teacher_email) {
              homeroomUser.email = cls.homeroom_teacher_email;
              changed = true;
            }
            if (changed) {
              await storage.saveUser(homeroomUser);
            }
          }
        } catch (e) {
          console.error('[API Classes] Error syncing homeroom user:', e);
        }

        return JsonResponse.ok({ success: true, class: cls });
      }
      if (method === 'DELETE') {
        const idToDelete = req.body?.id || query.id;
        if (idToDelete) {
          await storage.deleteClass(idToDelete);
        }
        return JsonResponse.ok({ success: true });
      }
    }

    if (pathname === '/api/sessions') {
      if (method === 'GET') {
        const sessions = await storage.getSessions();
        return JsonResponse.ok({ sessions });
      }
      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }
      if (method === 'POST') {
        const session = await storage.saveSession(req.body);
        return JsonResponse.ok({ success: true, session });
      }
      if (method === 'DELETE') {
        const idToDelete = req.body?.id || query.id;
        if (idToDelete) {
          await storage.deleteSession(idToDelete);
        }
        return JsonResponse.ok({ success: true });
      }
    }

    // 10. SETTINGS: /api/settings
    if (pathname === '/api/settings') {
      if (method === 'GET') {
        const settings = await storage.getSettings();
        return JsonResponse.ok({ settings });
      }
      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }
      const updated = await storage.updateSettings(req.body);
      return JsonResponse.ok({ success: true, settings: updated });
    }

    // 11. NOTIFICATIONS & TEST EMAIL: /api/notifications
    if (pathname === '/api/notifications') {
      if (method === 'GET') {
        const settings = await storage.getNotificationSettings();
        const logs = await storage.getNotificationLogs();
        return JsonResponse.ok({ settings, logs });
      }

      const validRes = await authService.validateActiveSession(token);
      if (!validRes.valid) {
        return JsonResponse.unauthorized();
      }

      if (query.action === 'test_email') {
        const { email } = req.body;
        if (!email) return JsonResponse.badRequest('Email tujuan wajib diisi.');
        const result = await notificationService.sendTestEmail(email);
        return JsonResponse.ok(result);
      }

      if (query.action === 'send_weekly_recap') {
        const { classId } = req.body || {};
        if (classId) {
          const result = await notificationService.sendWeeklyHomeroomRecap(classId);
          return JsonResponse.ok(result);
        } else {
          const result = await notificationService.sendAllWeeklyRecaps();
          return JsonResponse.ok(result);
        }
      }

      const updated = await storage.updateNotificationSettings(req.body);
      return JsonResponse.ok({ success: true, settings: updated });
    }

    // 12. LEAVE REQUESTS: /api/leave-requests
    if (pathname === '/api/leave-requests') {
      if (method === 'GET') {
        const requests = await storage.getLeaveRequests();
        return JsonResponse.ok({ requests });
      }

      if (method === 'POST') {
        const newReq = {
          id: `lr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...req.body,
          status: 'pending' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const saved = await storage.saveLeaveRequest(newReq);
        return JsonResponse.ok({ success: true, request: saved });
      }

      if (method === 'PUT') {
        // Approve / Reject by Homeroom or Admin
        const validRes = await authService.validateActiveSession(token);
        if (!validRes.valid) return JsonResponse.unauthorized();

        const { id, status, rejectionReason } = req.body;
        const requests = await storage.getLeaveRequests();
        const existing = requests.find((r) => r.id === id);
        if (!existing) return JsonResponse.notFound('Pengajuan izin tidak ditemukan.');

        existing.status = status;
        existing.approved_by = validRes.session?.name;
        existing.approved_at = new Date().toISOString();
        if (rejectionReason) existing.rejection_reason = rejectionReason;

        const saved = await storage.saveLeaveRequest(existing);
        return JsonResponse.ok({ success: true, request: saved });
      }
    }

    // 13. AUDIT LOGS: /api/audit
    if (pathname === '/api/audit') {
      const logs = await storage.getAuditLogs();
      return JsonResponse.ok({ logs });
    }

    // 14. SELF-TEST SIMULATION (Bagian 13 Poin 9)
    // Concurrency testing: duplicate attendance, out-of-class quota race, double return confirm
    if (pathname === '/api/simulate') {
      const { testType } = req.body || {};
      const students = await storage.getStudents();
      const sessions = await storage.getSessions();
      const targetStudent = students[0];
      const targetSession = sessions[0];

      if (testType === 'duplicate_attendance') {
        // Simulate two devices scanning the same student simultaneously
        const dateStr = new Date().toISOString().split('T')[0];
        const promise1 = storage.recordAttendance({
          id: `att_sim_1_${Date.now()}`,
          student_id: targetStudent.nis,
          session_id: targetSession.id,
          date: dateStr,
          timestamp: new Date().toISOString(),
          status: 'Hadir',
          late_minutes: 0,
          method: 'rfid',
          device_id: 'device_gate_1',
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const promise2 = storage.recordAttendance({
          id: `att_sim_2_${Date.now()}`,
          student_id: targetStudent.nis,
          session_id: targetSession.id,
          date: dateStr,
          timestamp: new Date().toISOString(),
          status: 'Hadir',
          late_minutes: 0,
          method: 'barcode',
          device_id: 'device_gate_2',
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const [res1, res2] = await Promise.all([promise1, promise2]);
        return JsonResponse.ok({
          test: 'duplicate_attendance',
          device1: { success: res1.success, isDuplicate: res1.isDuplicate, message: res1.message },
          device2: { success: res2.success, isDuplicate: res2.isDuplicate, message: res2.message },
          conclusion: (res1.success && res2.isDuplicate) || (res2.success && res1.isDuplicate)
            ? 'SUKSES: Hanya satu presensi yang diterima, duplikat berhasil ditolak dan dicegah.'
            : 'Perhatian: Periksa kembali konsistensi data.',
        });
      }

      if (testType === 'out_of_class_quota_race') {
        // Simulate two students from same class requesting permission when class quota has only 1 spot left
        const classStudents = students.filter((s) => s.class_id === targetStudent.class_id);
        const s1 = classStudents[0];
        const s2 = classStudents[1] || students[1];

        const req1 = storage.startOutOfClass({
          id: `ooc_sim_1_${Date.now()}`,
          student_id: s1.nis,
          class_id: s1.class_id,
          type: 'BAK',
          duration_minutes: 5,
          started_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 5 * 60000).toISOString(),
          late_return_minutes: 0,
          status: 'active',
          idempotency_key: `key_sim_1_${Date.now()}`,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const req2 = storage.startOutOfClass({
          id: `ooc_sim_2_${Date.now()}`,
          student_id: s2.nis,
          class_id: s2.class_id,
          type: 'BAB',
          duration_minutes: 10,
          started_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 10 * 60000).toISOString(),
          late_return_minutes: 0,
          status: 'active',
          idempotency_key: `key_sim_2_${Date.now()}`,
          version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const [res1, res2] = await Promise.all([req1, req2]);
        return JsonResponse.ok({
          test: 'out_of_class_quota_race',
          req1: { success: res1.success, error: res1.error },
          req2: { success: res2.success, error: res2.error },
          conclusion: 'Pengujian kuota kelas selesai dievaluasi di server.',
        });
      }

      return JsonResponse.badRequest('Jenis pengujian tidak valid.');
    }

    return JsonResponse.notFound(`Endpoint ${pathname} tidak ditemukan.`);
  } catch (err: any) {
    console.error(`[API ERROR] ${method} ${pathname}:`, err);
    return JsonResponse.serverError(err);
  }
}
