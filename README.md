# DISIPLIN KITA BISA

Aplikasi Web Presensi dan Kedisiplinan Siswa Sekolah berbasis React + Vite + TypeScript, didukung arsitektur sinkronisasi real-time multi-perangkat dan serverless backend yang siap dideploy ke **Vercel** dengan basis data **Google Sheets** dan penyimpanan foto bukti di **Google Drive**.

---

## 🚀 Fitur Utama

1. **Alur Masuk Tunggal (Petugas Piket):**
   - Layar login minimalis dengan satu kolom input password piket (tanpa username/peran).
   - Dilengkapi proteksi penguncian otomatis (lockout) 5 menit setelah 5 kali gagal.
   - Langsung membuka menu **Presensi** setelah berhasil masuk.
2. **Menu 1 - Presensi (Scan & RFID USB Tanpa Kamera):**
   - Jam digital tersinkronisasi dengan server (clock offset).
   - Frame tunggal otomatis fokus (always-focused) untuk menerima input dari USB Barcode Scanner maupun USB RFID Reader secara instan saat Enter diterima, tanpa tombol kirim.
   - Kotak pemberitahuan tengah layar (3–5 detik) dan pembacaan suara **Text-to-Speech (TTS id-ID)** otomatis.
   - Fitur presensi manual (pencarian autocomplete fuzzy), koreksi dengan audit log, dan mode layar penuh (kiosk).
3. **Menu 2 - Izin Keluar Kelas Berkuota:**
   - Pencarian siswa berbasis pengetikan nama dengan saran otomatis (tidak menggunakan scan/kamera).
   - Pilihan jenis izin cepat: BAK (5 menit), BAB (10 menit), Keperluan Lain (2 menit).
   - Validasi ketat di server: kuota maksimal 2 siswa per kelas di luar kelas bersamaan, maksimal 2 izin per hari per siswa.
   - Hitung mundur real-time dan peringatan suara "Melebihi Waktu" bila melewati batas waktu.
   - Ikon centang besar (✓) untuk konfirmasi kepulangan dan penghitungan keterlambatan kembali otomatis.
4. **Menu 3 - Pelanggaran & Poin Prestasi:**
   - Pengambilan foto bukti menggunakan kamera perangkat (`navigator.mediaDevices.getUserMedia`) dengan tombol ganti kamera depan/belakang, kompresi kanvas, dan cadangan unggah dari galeri.
   - Kalkulasi otomatis akumulasi poin pelanggaran dan status Surat Peringatan (SP1, SP2, SP3 / Panggilan Orang Tua).
   - Tab pencatatan poin prestasi bernilai positif.
   - Galeri foto bukti pelanggaran serta ekspor Excel dan cetak PDF.
5. **Menu 4 - Dasbor & Analitik:**
   - Kartu ringkasan harian/mingguan/bulanan/semester.
   - Grafik Recharts Donut & Bar dengan fitur drill-down interaktif (Kategori ➔ Kelas ➔ Siswa ➔ Profil).
   - Ranking Terlambat, Ranking Terlambat Kembali, dan Ranking Disiplin.
   - Penghargaan otomatis "Siswa Disiplin Pekan Ini".
6. **Menu 5 - Wali Kelas (Terkunci):**
   - Verifikasi Nama + Password + Pilihan Kelas.
   - 8 Tab analisis khusus kelas yang diampu, termasuk persetujuan pengajuan surat izin/sakit siswa.
7. **Menu 6 - Kesiswaan (Terkunci):**
   - Verifikasi Password Kesiswaan untuk pengawasan tingkat sekolah.
   - Pencetak surat peringatan (SP) dan laporan resmi ber-kop sekolah.
8. **Menu 7 - Administrator (Terkunci):**
   - Manajemen Sesi Absen & jadwal peralihan otomatis.
   - Basis data siswa: unduh template Excel otomatis, impor data dengan validasi baris merah, registrasi kartu RFID instan, dan cetak kartu siswa.
   - Manajemen akun & password dengan pemutusan sesi lama otomatis (*token versioning*).
   - Notifikasi email orang tua via SMTP Nodemailer dengan log status pengiriman.
   - Panel pengujian mandiri untuk mensimulasikan penulisan serentak (*concurrency race condition*).

---

## 🔑 Kredensial Bawaan Sistem (Default)

| Peran | Kredensial Masuk | Keterangan |
| :--- | :--- | :--- |
| **Petugas Piket** | Password: `piket123` | Digunakan pada layar awal aplikasi |
| **Wali Kelas (X RPL 1)** | Nama: `Dra. Siti Aminah, M.Pd`<br>Password: `wali123`<br>Kelas: `10-RPL-1` | Menu Wali Kelas (Terkunci) |
| **Wali Kelas (X TKJ 1)** | Nama: `Budi Santoso, S.Kom`<br>Password: `wali123`<br>Kelas: `10-TKJ-1` | Menu Wali Kelas (Terkunci) |
| **Kesiswaan** | Password: `kesiswaan123` | Menu Kesiswaan (Terkunci) |
| **Administrator** | Password: `admin123` | Menu Admin (Terkunci) |

---

## 🛠️ Langkah Menjalankan Secara Lokal

1. Pasang dependensi:
   ```bash
   npm install
   ```
2. Jalankan server pengembang:
   ```bash
   npm run dev
   ```
3. Buka peramban di `http://localhost:3000`.

---

## ☁️ Langkah Deploy ke Vercel

Aplikasi ini telah dirancang dengan arsitektur serverless function di folder `/api` dan konfigurasi `vercel.json`:

1. Hubungkan repositori ke **Vercel**.
2. Masukkan Environment Variables di Vercel Dashboard (*Settings ➔ Environment Variables*):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (Pastikan karakter `\n` ditangani dengan baik)
   - `SPREADSHEET_ID`
   - `DRIVE_FOLDER_ID`
   - `JWT_SECRET`
   - *(Opsional untuk email)* `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_NAME`
3. Klik **Deploy**. Vercel akan otomatis menjalankan `npm run build` dan memetakan `/api/*.ts` sebagai Serverless Functions.

*Catatan:* Bila kredensial Google Sheets belum diisi, aplikasi secara cerdas beralih ke penyimpanan lokal `.data/database.json` sehingga aplikasi tetap 100% fungsional untuk pengujian dan demonstrasi.
