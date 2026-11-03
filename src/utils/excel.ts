import * as XLSX from 'xlsx';

/**
 * Excel export and import utilities powered by SheetJS
 */

export function exportToExcel(data: any[], fileName: string, sheetName = 'Data') {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

export interface StudentImportRow {
  NIS: string;
  NISN?: string;
  Nama: string;
  Kelas: string;
  Jenis_Kelamin?: 'L' | 'P';
  UID_RFID?: string;
  Nama_Orang_Tua?: string;
  Email_Orang_Tua?: string;
  isValid?: boolean;
  errors?: string[];
  sheetSource?: string;
}

function normalizeKey(str: string): string {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Clean & normalize Class/Rombel name
 * e.g. "X RPL 1" -> "10-RPL-1", "XI TKJ 2" -> "11-TKJ-2", "XII MM" -> "12-MM"
 */
function cleanClassName(raw: string): string {
  let val = String(raw || '').trim();
  if (!val) return '';

  // Convert roman numerals at start: X -> 10, XI -> 11, XII -> 12
  val = val.replace(/^X\b/i, '10')
           .replace(/^XI\b/i, '11')
           .replace(/^XII\b/i, '12');

  // Replace spaces with hyphens if not already separated
  if (val.includes(' ') && !val.includes('-')) {
    val = val.replace(/\s+/g, '-');
  }

  return val;
}

/**
 * Checks if a sheet name looks like an instructional or meta sheet rather than a class data sheet
 */
function isMetaSheetName(name: string): boolean {
  const norm = normalizeKey(name);
  const metaKeywords = ['petunjuk', 'panduan', 'instruksi', 'instructions', 'template', 'format', 'cover', 'readme', 'rekap'];
  return metaKeywords.some((k) => norm.includes(k));
}

export async function parseStudentExcel(file: File, fallbackClassId: string = '10-Umum'): Promise<StudentImportRow[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const allRows: StudentImportRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    // Convert to 2D array to accurately detect header row
    const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (!rawData || rawData.length === 0) continue;

    // 1. Locate header row (search top 12 rows for key column terms)
    let headerRowIdx = -1;
    let colMap: Record<string, number> = {};

    for (let r = 0; r < Math.min(rawData.length, 12); r++) {
      const row = rawData[r];
      if (!Array.isArray(row)) continue;

      const tempMap: Record<string, number> = {};
      let matches = 0;

      row.forEach((cell, colIdx) => {
        const text = normalizeKey(String(cell));
        if (!text) return;

        if (['jeniskelamin', 'jk', 'gender', 'sex', 'lp'].some((k) => text === k || text.includes('kelamin'))) {
          tempMap['gender'] = colIdx;
          matches++;
        } else if (['nisn', 'nomornisn'].some((k) => text === k || text.includes('nisn'))) {
          tempMap['nisn'] = colIdx;
          matches++;
        } else if (
          text === 'nis' ||
          text === 'noinduk' ||
          text === 'nomorinduk' ||
          text === 'noinduksiswa' ||
          text === 'nik' ||
          text === 'nomor' ||
          (text.startsWith('nis') && !text.includes('kelamin') && !text.includes('nisn'))
        ) {
          tempMap['nis'] = colIdx;
          matches++;
        } else if (['namasiswa', 'namapesertadidik', 'namalengkap', 'nama', 'name', 'student'].some((k) => text === k || text.includes('nama') || text.includes('student'))) {
          tempMap['nama'] = colIdx;
          matches++;
        } else if (['kelas', 'rombel', 'rombonganbelajar', 'tingkat', 'tingkatkelas', 'kelasrombel', 'class', 'grade'].some((k) => text === k || text.includes('kelas') || text.includes('rombel') || text.includes('class'))) {
          tempMap['kelas'] = colIdx;
          matches++;
        } else if (['rfid', 'uidrfid', 'uid', 'kartu', 'nomorkartu', 'rfiduid', 'cardcode'].some((k) => text === k || text.includes('rfid') || text.includes('kartu'))) {
          tempMap['rfid'] = colIdx;
          matches++;
        } else if (['namaorangtua', 'orangtua', 'wali', 'namawali', 'ayah', 'ibu', 'parent'].some((k) => text === k || text.includes('orangtua') || text.includes('wali') || text.includes('parent'))) {
          tempMap['parent_name'] = colIdx;
          matches++;
        } else if (['email', 'emailorangtua', 'emailwali', 'kontak'].some((k) => text === k || text.includes('email') || text.includes('mail'))) {
          tempMap['parent_email'] = colIdx;
          matches++;
        }
      });

      // Header row must have at least nama or nis
      if (tempMap['nama'] !== undefined || tempMap['nis'] !== undefined) {
        headerRowIdx = r;
        colMap = tempMap;
        break;
      }
    }

    // If no header found and sheet looks like meta/instructions, skip it
    if (headerRowIdx === -1) {
      if (isMetaSheetName(sheetName)) continue;
      // Fallback: use first row as header with standard key indexing
      headerRowIdx = 0;
    }

    // Infer default class from sheet name if sheet name looks like a class (e.g. "10-RPL-1", "X RPL 1", "XI-TKJ")
    let sheetInferredClass = '';
    if (!isMetaSheetName(sheetName)) {
      const cleanSheet = cleanClassName(sheetName);
      if (cleanSheet.match(/^(10|11|12|[0-9]+|[a-z]+)/i)) {
        sheetInferredClass = cleanSheet;
      }
    }

    let lastKnownClass = sheetInferredClass || fallbackClassId;

    // Process rows under header
    for (let r = headerRowIdx + 1; r < rawData.length; r++) {
      const row = rawData[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const getColVal = (key: string): string => {
        if (colMap[key] !== undefined) {
          return String(row[colMap[key]] ?? '').trim();
        }
        return '';
      };

      const nama = getColVal('nama');
      let nis = getColVal('nis');
      const nisn = getColVal('nisn');
      let rawKelas = getColVal('kelas');
      const rawGender = getColVal('gender');
      const rawRfid = getColVal('rfid');
      const parentName = getColVal('parent_name');
      const parentEmail = getColVal('parent_email');

      // Skip completely empty lines
      if (!nama && !nis) continue;

      // Auto-generate NIS if missing but name is present
      if (!nis && nama) {
        nis = `SISWA-${allRows.length + 1}`;
      }

      // Auto-fill Kelas: from row -> or from sheet name -> or from previous row -> or fallback
      let kelas = cleanClassName(rawKelas);
      if (!kelas) {
        kelas = sheetInferredClass || lastKnownClass || fallbackClassId;
      } else {
        lastKnownClass = kelas;
      }

      const gender = (rawGender.toUpperCase().startsWith('P') ? 'P' : 'L') as 'L' | 'P';
      const rfid = rawRfid || `RFID-${nis}`;

      allRows.push({
        NIS: nis,
        NISN: nisn,
        Nama: nama || `Siswa ${nis}`,
        Kelas: kelas,
        Jenis_Kelamin: gender,
        UID_RFID: rfid,
        Nama_Orang_Tua: parentName,
        Email_Orang_Tua: parentEmail,
        sheetSource: sheetName,
      });
    }
  }

  return allRows;
}

export function downloadStudentTemplate() {
  window.location.href = '/api/students?action=template';
}
