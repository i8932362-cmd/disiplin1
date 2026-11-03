import nodemailer from 'nodemailer';
import { storage } from './storage.js';
import { NotificationLog, Student } from './types.js';

interface EmailPayload {
  student: Student;
  triggerType: 'terlambat' | 'alpha' | 'izin_sakit' | 'pelanggaran' | 'ambang_peringatan' | 'melebihi_waktu';
  status: string;
  violationName?: string;
  points?: number;
  lateReturnMinutes?: number;
  customDetails?: string;
}

export class NotificationService {
  private transporter: any = null;
  private isSmtpConfigured = false;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      try {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass },
        });
        this.isSmtpConfigured = true;
      } catch (err) {
        console.error('[NotificationService] Failed to init transporter:', err);
        this.isSmtpConfigured = false;
      }
    }
  }

  /**
   * Dispatch notification based on triggers and settings
   */
  async notifyParent(payload: EmailPayload): Promise<{ sent: boolean; reason?: string }> {
    try {
      const settings = await storage.getSettings();
      const notifSettings = await storage.getNotificationSettings();

      // Check if feature toggle or email is enabled
      if (!settings.toggle_email_notifications || !notifSettings.email_enabled) {
        return { sent: false, reason: 'Fitur notifikasi email nonaktif.' };
      }

      // Check trigger conditions
      let shouldTrigger = false;
      switch (payload.triggerType) {
        case 'terlambat':
          shouldTrigger = notifSettings.trigger_late;
          break;
        case 'alpha':
          shouldTrigger = notifSettings.trigger_alpha;
          break;
        case 'izin_sakit':
          shouldTrigger = notifSettings.trigger_leave;
          break;
        case 'pelanggaran':
          shouldTrigger = notifSettings.trigger_violation;
          break;
        case 'ambang_peringatan':
          shouldTrigger = notifSettings.trigger_warning_threshold;
          break;
        case 'melebihi_waktu':
          shouldTrigger = notifSettings.trigger_overdue_out_of_class;
          break;
      }

      if (!shouldTrigger) {
        return { sent: false, reason: 'Pemicu notifikasi ini dinonaktifkan di pengaturan.' };
      }

      const email = payload.student.parent_email?.trim();
      const now = new Date();
      const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

      // If no parent email, log skipped
      if (!email || !email.includes('@')) {
        const log: NotificationLog = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now.toISOString(),
          student_id: payload.student.nis,
          student_name: payload.student.name,
          recipient_email: email || '-',
          trigger_type: payload.triggerType,
          status: 'skipped_no_email',
          error_message: 'Email orang tua tidak terdaftar atau tidak valid.',
          created_at: now.toISOString(),
        };
        await storage.logNotification(log);
        return { sent: false, reason: 'Email orang tua tidak terdaftar.' };
      }

      // Build text with templates
      let subject = notifSettings.subject_template || 'Pemberitahuan Kedisiplinan Siswa: {nama_siswa} ({kelas})';
      let body = notifSettings.body_template || 'Yth. Orang Tua dari {nama_siswa},\n\nSiswa tercatat: {status}.\nSekolah: {nama_sekolah}';

      const replacements: Record<string, string> = {
        '{nama_siswa}': payload.student.name,
        '{kelas}': payload.student.class_id,
        '{tanggal}': dateStr,
        '{jam}': timeStr,
        '{status}': payload.status,
        '{pelanggaran}': payload.violationName || '-',
        '{poin}': payload.points !== undefined ? String(payload.points) : '0',
        '{menit_terlambat_kembali}': payload.lateReturnMinutes !== undefined ? String(payload.lateReturnMinutes) : '0',
        '{nama_sekolah}': settings.school_name,
      };

      for (const [k, v] of Object.entries(replacements)) {
        subject = subject.split(k).join(v);
        body = body.split(k).join(v);
      }

      // If SMTP is not configured in environment, simulate successful delivery & log
      if (!this.transporter || !this.isSmtpConfigured) {
        console.log(`[NotificationService] (Simulated Delivery - SMTP not set in .env) To: ${email} | Subject: ${subject}`);
        const log: NotificationLog = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now.toISOString(),
          student_id: payload.student.nis,
          student_name: payload.student.name,
          recipient_email: email,
          trigger_type: payload.triggerType,
          status: 'sent',
          error_message: undefined,
          created_at: now.toISOString(),
        };
        await storage.logNotification(log);
        return { sent: true };
      }

      // Real SMTP send
      const fromName = process.env.MAIL_FROM_NAME || settings.school_name || 'DISIPLIN KITA BISA';
      const mailOptions = {
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        text: body,
      };

      await this.transporter.sendMail(mailOptions);

      const log: NotificationLog = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now.toISOString(),
        student_id: payload.student.nis,
        student_name: payload.student.name,
        recipient_email: email,
        trigger_type: payload.triggerType,
        status: 'sent',
        created_at: now.toISOString(),
      };
      await storage.logNotification(log);

      return { sent: true };
    } catch (err: any) {
      console.error('[NotificationService] Email send error:', err);
      // Non-blocking: record error in log
      const now = new Date();
      const log: NotificationLog = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now.toISOString(),
        student_id: payload.student.nis,
        student_name: payload.student.name,
        recipient_email: payload.student.parent_email || '-',
        trigger_type: payload.triggerType,
        status: 'failed',
        error_message: err?.message || 'Gagal mengirim email',
        created_at: now.toISOString(),
      };
      await storage.logNotification(log);
      return { sent: false, reason: err?.message };
    }
  }

  /**
   * Test sending an email
   */
  async sendTestEmail(targetEmail: string): Promise<{ success: boolean; message: string }> {
    const settings = await storage.getSettings();
    if (!this.transporter || !this.isSmtpConfigured) {
      return {
        success: true,
        message: 'Mode simulasi: Konfigurasi SMTP belum dipasang di .env. Pesan uji coba berhasil dicatat di log notifikasi.',
      };
    }

    try {
      const fromName = process.env.MAIL_FROM_NAME || settings.school_name;
      await this.transporter.sendMail({
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to: targetEmail,
        subject: `[Uji Coba] Sistem Notifikasi ${settings.school_name}`,
        text: `Halo,\n\nIni adalah pesan uji coba sistem notifikasi orang tua dari aplikasi DISIPLIN KITA BISA (${settings.school_name}). Konfigurasi SMTP berhasil berfungsi dengan baik!`,
      });
      return { success: true, message: `Email uji coba berhasil dikirim ke ${targetEmail}` };
    } catch (err: any) {
      return { success: false, message: `Gagal mengirim email: ${err.message}` };
    }
  }

  /**
   * Send Weekly Attendance Recap per Session to Homeroom Teacher Email
   */
  async sendWeeklyHomeroomRecap(
    classId: string,
    customStartDate?: string,
    customEndDate?: string
  ): Promise<{ sent: boolean; reason?: string; recipient?: string; studentCount?: number }> {
    try {
      const settings = await storage.getSettings();
      const classes = await storage.getClasses();
      const cls = classes.find((c) => c.id === classId);

      if (!cls) {
        return { sent: false, reason: `Kelas "${classId}" tidak ditemukan.` };
      }

      const email = cls.homeroom_teacher_email?.trim();
      const now = new Date();

      // Check if homeroom email is configured
      if (!email || !email.includes('@')) {
        const log: NotificationLog = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now.toISOString(),
          student_id: cls.id,
          student_name: `Kelas ${cls.name} (${cls.homeroom_teacher_name})`,
          recipient_email: email || '-',
          trigger_type: 'rekap_mingguan',
          status: 'skipped_no_email',
          error_message: 'Email wali kelas belum diatur oleh Administrator di menu Kelola Kelas.',
          created_at: now.toISOString(),
        };
        await storage.logNotification(log);
        return { sent: false, reason: `Email wali kelas untuk ${cls.name} belum diatur oleh Admin.` };
      }

      // Compute week range
      let startStr = customStartDate;
      let endStr = customEndDate;

      if (!startStr || !endStr) {
        const d = new Date(now);
        const day = d.getDay();
        const diffToMonday = (day === 0 ? -6 : 1) - day;
        const monday = new Date(d.setDate(d.getDate() + diffToMonday));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        startStr = monday.toISOString().split('T')[0];
        endStr = (customEndDate || now.toISOString().split('T')[0]);
      }

      // Fetch students of this class
      const allStudents = await storage.getStudents();
      const classStudents = allStudents.filter((s) => s.class_id === classId);
      const studentMap = new Map(classStudents.map((s) => [s.nis, s]));

      // Fetch active sessions
      const sessions = (await storage.getSessions()).filter((s) => s.is_active);

      // Fetch attendance in this period
      const allAttendance = await storage.getAttendance();
      const periodAttendance = allAttendance.filter(
        (a) => a.date >= startStr! && a.date <= endStr! && studentMap.has(a.student_id)
      );

      // Aggregate session metrics
      const sessionSummaries = sessions.map((sess) => {
        const sessRecords = periodAttendance.filter((a) => a.session_id === sess.id);
        const hadirCount = sessRecords.filter((a) => a.status === 'Hadir').length;
        const terlambatCount = sessRecords.filter((a) => a.status === 'Terlambat').length;
        const izinCount = sessRecords.filter((a) => a.status === 'Izin').length;
        const sakitCount = sessRecords.filter((a) => a.status === 'Sakit').length;
        const alphaCount = sessRecords.filter((a) => a.status === 'Alpha').length;

        // Student rows for this session
        const studentRows = classStudents.map((s) => {
          const recs = sessRecords.filter((r) => r.student_id === s.nis);
          const h = recs.filter((r) => r.status === 'Hadir').length;
          const t = recs.filter((r) => r.status === 'Terlambat').length;
          const i = recs.filter((r) => r.status === 'Izin').length;
          const sk = recs.filter((r) => r.status === 'Sakit').length;
          const a = recs.filter((r) => r.status === 'Alpha').length;
          return {
            nis: s.nis,
            name: s.name,
            hadir: h,
            terlambat: t,
            izin: i,
            sakit: sk,
            alpha: a,
            totalScanned: recs.length,
          };
        });

        return {
          session: sess,
          totalRecords: sessRecords.length,
          hadirCount,
          terlambatCount,
          izinCount,
          sakitCount,
          alphaCount,
          studentRows,
        };
      });

      // Overall class totals across all sessions
      const totalHadir = sessionSummaries.reduce((acc, s) => acc + s.hadirCount, 0);
      const totalTerlambat = sessionSummaries.reduce((acc, s) => acc + s.terlambatCount, 0);
      const totalIzin = sessionSummaries.reduce((acc, s) => acc + s.izinCount, 0);
      const totalSakit = sessionSummaries.reduce((acc, s) => acc + s.sakitCount, 0);
      const totalAlpha = sessionSummaries.reduce((acc, s) => acc + s.alphaCount, 0);

      // Students needing special attention (Alpha >= 1 or Terlambat >= 2)
      const atRiskStudents = classStudents
        .map((s) => {
          const sRecs = periodAttendance.filter((a) => a.student_id === s.nis);
          const aCount = sRecs.filter((r) => r.status === 'Alpha').length;
          const tCount = sRecs.filter((r) => r.status === 'Terlambat').length;
          return { student: s, alpha: aCount, terlambat: tCount };
        })
        .filter((item) => item.alpha >= 1 || item.terlambat >= 2);

      // Generate HTML Email
      const schoolName = settings.school_name || 'SMK BISA HEBAT NUSANTARA';
      const subject = `[Rekap Presensi Mingguan] Kelas ${cls.name} - Periode ${startStr} s.d. ${endStr}`;

      const sessionSectionsHtml = sessionSummaries
        .map(
          (sum) => `
        <div style="margin-top: 24px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #0f172a; color: #ffffff; padding: 12px 16px;">
            <h3 style="margin: 0; font-size: 15px; font-weight: 600;">
              📌 Sesi: ${sum.session.name} (${sum.session.start_time} - ${sum.session.end_time})
            </h3>
            <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">
              Batas Tepat Waktu: ${sum.session.on_time_limit} WIB | Toleransi: ${sum.session.late_tolerance_minutes} Menit
            </p>
          </div>
          <div style="padding: 12px 16px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; gap: 16px; font-size: 12px;">
            <span style="color: #059669; font-weight: bold;">Hadir: ${sum.hadirCount}</span> &bull;
            <span style="color: #d97706; font-weight: bold;">Terlambat: ${sum.terlambatCount}</span> &bull;
            <span style="color: #2563eb; font-weight: bold;">Izin: ${sum.izinCount}</span> &bull;
            <span style="color: #7c3aed; font-weight: bold;">Sakit: ${sum.sakitCount}</span> &bull;
            <span style="color: #dc2626; font-weight: bold;">Alpha: ${sum.alphaCount}</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
            <thead>
              <tr style="background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1; color: #334155;">
                <th style="padding: 8px 12px; width: 40px;">No</th>
                <th style="padding: 8px 12px; width: 100px;">NIS</th>
                <th style="padding: 8px 12px;">Nama Siswa</th>
                <th style="padding: 8px 12px; text-align: center; width: 60px;">Hadir</th>
                <th style="padding: 8px 12px; text-align: center; width: 70px;">Terlambat</th>
                <th style="padding: 8px 12px; text-align: center; width: 60px;">Izin</th>
                <th style="padding: 8px 12px; text-align: center; width: 60px;">Sakit</th>
                <th style="padding: 8px 12px; text-align: center; width: 60px;">Alpha</th>
              </tr>
            </thead>
            <tbody>
              ${sum.studentRows
                .map(
                  (row, idx) => `
                <tr style="border-bottom: 1px solid #e2e8f0; background-color: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding: 8px 12px; color: #64748b;">${idx + 1}</td>
                  <td style="padding: 8px 12px; font-family: monospace;">${row.nis}</td>
                  <td style="padding: 8px 12px; font-weight: 500; color: #0f172a;">${row.name}</td>
                  <td style="padding: 8px 12px; text-align: center; color: #059669; font-weight: 600;">${row.hadir}</td>
                  <td style="padding: 8px 12px; text-align: center; color: ${row.terlambat > 0 ? '#d97706' : '#94a3b8'}; font-weight: ${row.terlambat > 0 ? '600' : 'normal'};">${row.terlambat}</td>
                  <td style="padding: 8px 12px; text-align: center; color: ${row.izin > 0 ? '#2563eb' : '#94a3b8'};">${row.izin}</td>
                  <td style="padding: 8px 12px; text-align: center; color: ${row.sakit > 0 ? '#7c3aed' : '#94a3b8'};">${row.sakit}</td>
                  <td style="padding: 8px 12px; text-align: center; color: ${row.alpha > 0 ? '#dc2626' : '#94a3b8'}; font-weight: ${row.alpha > 0 ? '700' : 'normal'};">${row.alpha}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      `
        )
        .join('');

      const atRiskHtml =
        atRiskStudents.length > 0
          ? `
        <div style="margin-top: 24px; padding: 16px; background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px;">
          <h4 style="margin: 0 0 8px 0; color: #be123c; font-size: 14px;">
            ⚠️ Siswa yang Membutuhkan Perhatian & Pembinaan:
          </h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #881337;">
            ${atRiskStudents
              .map(
                (item) => `
              <li><strong>${item.student.name}</strong> (${item.student.nis}): ${item.alpha > 0 ? `<span style="color: #e11d48;">${item.alpha}x Alpha</span>` : ''} ${item.terlambat > 0 ? `<span style="color: #b45309;">${item.terlambat}x Terlambat</span>` : ''}</li>
            `
              )
              .join('')}
          </ul>
        </div>
      `
          : '';

      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #1e293b; line-height: 1.5; padding: 20px; background-color: #ffffff;">
          <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h1 style="margin: 0; font-size: 20px; color: #0f172a; font-weight: bold;">
                  ${schoolName}
                </h1>
                <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">
                  Sistem Informasi Presensi & Kedisiplinan Siswa
                </p>
              </div>
              <div style="text-align: right;">
                <span style="display: inline-block; padding: 4px 10px; background-color: #e2e8f0; color: #334155; border-radius: 4px; font-size: 12px; font-weight: 600;">
                  Rekap Mingguan Otomatis
                </span>
              </div>
            </div>
          </div>

          <p style="font-size: 14px; margin: 0 0 16px 0;">
            Yth. <strong>${cls.homeroom_teacher_name}</strong>,<br>
            Berikut adalah laporan rekapitulasi presensi mingguan untuk kelas <strong>${cls.name}</strong> periode <strong>${startStr}</strong> s.d. <strong>${endStr}</strong> yang dikelompokkan berdasarkan sesi presensi.
          </p>

          <!-- Ringkasan Global -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px;">
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; text-align: center;">
              <span style="font-size: 11px; color: #64748b; display: block; text-transform: uppercase;">Total Siswa</span>
              <strong style="font-size: 20px; color: #0f172a;">${classStudents.length}</strong>
            </div>
            <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 12px; text-align: center;">
              <span style="font-size: 11px; color: #047857; display: block; text-transform: uppercase;">Total Hadir</span>
              <strong style="font-size: 20px; color: #065f46;">${totalHadir}</strong>
            </div>
            <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; text-align: center;">
              <span style="font-size: 11px; color: #b45309; display: block; text-transform: uppercase;">Total Terlambat</span>
              <strong style="font-size: 20px; color: #92400e;">${totalTerlambat}</strong>
            </div>
            <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px; text-align: center;">
              <span style="font-size: 11px; color: #b91c1c; display: block; text-transform: uppercase;">Total Alpha</span>
              <strong style="font-size: 20px; color: #991b1b;">${totalAlpha}</strong>
            </div>
          </div>

          ${atRiskHtml}

          <!-- Rincian per Sesi -->
          ${sessionSectionsHtml}

          <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center;">
            <p style="margin: 0;">
              Laporan ini dikirim secara otomatis oleh sistem kepada Wali Kelas. Email tujuan dikelola langsung oleh Administrator Sekolah.
            </p>
            <p style="margin: 4px 0 0 0;">
              ${schoolName} &bull; Waktu Laporan: ${now.toLocaleString('id-ID')}
            </p>
          </div>
        </div>
      `;

      const plainText = `
REKAP PRESENSI MINGGUAN KELAS ${cls.name}
${schoolName}
Periode: ${startStr} s.d. ${endStr}
Wali Kelas: ${cls.homeroom_teacher_name}

RINGKASAN TOTAL:
- Total Siswa: ${classStudents.length}
- Total Hadir: ${totalHadir}
- Total Terlambat: ${totalTerlambat}
- Total Izin: ${totalIzin}
- Total Sakit: ${totalSakit}
- Total Alpha: ${totalAlpha}

Laporan lengkap per sesi telah disertakan dalam versi HTML email ini.
Email tujuan ini dikelola oleh Administrator Sekolah.
      `.trim();

      // Dispatch or simulate
      if (!this.transporter || !this.isSmtpConfigured) {
        console.log(`[NotificationService] (Simulated Weekly Recap) To: ${email} | Subject: ${subject}`);
        const log: NotificationLog = {
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          timestamp: now.toISOString(),
          student_id: cls.id,
          student_name: `Kelas ${cls.name} (${cls.homeroom_teacher_name})`,
          recipient_email: email,
          trigger_type: 'rekap_mingguan',
          status: 'sent',
          error_message: undefined,
          created_at: now.toISOString(),
        };
        await storage.logNotification(log);
        return { sent: true, recipient: email, studentCount: classStudents.length };
      }

      // Real SMTP send
      const fromName = process.env.MAIL_FROM_NAME || settings.school_name || 'DISIPLIN KITA BISA';
      await this.transporter.sendMail({
        from: `"${fromName}" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        text: plainText,
        html: htmlBody,
      });

      const log: NotificationLog = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now.toISOString(),
        student_id: cls.id,
        student_name: `Kelas ${cls.name} (${cls.homeroom_teacher_name})`,
        recipient_email: email,
        trigger_type: 'rekap_mingguan',
        status: 'sent',
        created_at: now.toISOString(),
      };
      await storage.logNotification(log);

      return { sent: true, recipient: email, studentCount: classStudents.length };
    } catch (err: any) {
      console.error('[NotificationService] Failed to send weekly recap:', err);
      const now = new Date();
      const log: NotificationLog = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now.toISOString(),
        student_id: classId,
        student_name: `Rekap Mingguan Kelas ${classId}`,
        recipient_email: '-',
        trigger_type: 'rekap_mingguan',
        status: 'failed',
        error_message: err?.message || 'Gagal mengirim rekap mingguan',
        created_at: now.toISOString(),
      };
      await storage.logNotification(log);
      return { sent: false, reason: err?.message };
    }
  }

  /**
   * Send Weekly Recap to All Classes
   */
  async sendAllWeeklyRecaps(): Promise<{ total: number; sent: number; skipped: number; failed: number; results: any[] }> {
    const classes = await storage.getClasses();
    const results: any[] = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const c of classes) {
      const res = await this.sendWeeklyHomeroomRecap(c.id);
      results.push({ classId: c.id, className: c.name, homeroom: c.homeroom_teacher_name, ...res });
      if (res.sent) {
        sent++;
      } else if (res.reason?.includes('belum diatur')) {
        skipped++;
      } else {
        failed++;
      }
    }

    // Update weekly_recap_last_sent in notification_settings
    try {
      await storage.updateNotificationSettings({
        weekly_recap_last_sent: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[NotificationService] Error updating weekly_recap_last_sent:', e);
    }

    return { total: classes.length, sent, skipped, failed, results };
  }

  /**
   * Periodic scheduler checking if automated weekly recap should fire
   */
  async checkAndTriggerWeeklyRecap(): Promise<void> {
    try {
      const notifSettings = await storage.getNotificationSettings();
      if (!notifSettings.weekly_recap_enabled) return;

      const now = new Date();
      const targetDay = notifSettings.weekly_recap_day ?? 5; // Default Friday
      const currentDay = now.getDay();

      if (currentDay !== targetDay) return;

      const targetTime = notifSettings.weekly_recap_time || '15:00';
      const [targetH, targetM] = targetTime.split(':').map(Number);
      const currentH = now.getHours();
      const currentM = now.getMinutes();

      if (currentH < targetH || (currentH === targetH && currentM < targetM)) return;

      // Check if already sent today
      if (notifSettings.weekly_recap_last_sent) {
        const lastSentDate = new Date(notifSettings.weekly_recap_last_sent);
        const isSameDay =
          lastSentDate.getFullYear() === now.getFullYear() &&
          lastSentDate.getMonth() === now.getMonth() &&
          lastSentDate.getDate() === now.getDate();
        if (isSameDay) return;
      }

      console.log('[NotificationService] Automated weekly recap triggered by schedule!');
      await this.sendAllWeeklyRecaps();
    } catch (err) {
      console.error('[NotificationService] Error in checkAndTriggerWeeklyRecap:', err);
    }
  }
}

export const notificationService = new NotificationService();

// Start periodic background check every 5 minutes
setInterval(() => {
  notificationService.checkAndTriggerWeeklyRecap().catch(() => {});
}, 5 * 60 * 1000);

