export type UserRole = 'duty' | 'homeroom' | 'student_affairs' | 'admin';

export interface User {
  id: string;
  role: UserRole;
  name: string;
  class_id?: string;
  email?: string;
  password_hash: string;
  label: string;
  token_version: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Student {
  nis: string;
  nisn: string;
  name: string;
  class_id: string;
  gender: 'L' | 'P';
  rfid_uid: string;
  card_code: string;
  photo_url: string;
  parent_name: string;
  parent_email: string;
  created_at: string;
  updated_at: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  grade: string;
  major: string;
  homeroom_teacher_name: string;
  homeroom_teacher_email?: string;
  quota_limit: number;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSession {
  id: string;
  name: string;
  start_time: string; // HH:mm
  on_time_limit: string; // HH:mm
  end_time: string; // HH:mm
  active_days: number[]; // 0=Sunday, 1=Monday, ..., 6=Saturday
  late_tolerance_minutes: number;
  is_active: boolean;
  is_override?: boolean;
  created_at: string;
  updated_at: string;
}

export type AttendanceStatus = 'Hadir' | 'Terlambat' | 'Izin' | 'Sakit' | 'Alpha';

export interface AttendanceRecord {
  id: string;
  student_id: string; // NIS
  session_id: string;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string
  status: AttendanceStatus;
  late_minutes: number;
  method: 'rfid' | 'barcode' | 'manual';
  device_id: string;
  notes?: string;
  audited_by?: string;
  audit_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type OutOfClassType = 'BAK' | 'BAB' | 'Keperluan Lain';
export type OutOfClassStatus = 'active' | 'overdue' | 'returned' | 'auto_closed';
export type ReturnMethod = 'click' | 'manual' | 'auto_closed';

export interface OutOfClassRecord {
  id: string;
  student_id: string; // NIS
  class_id: string;
  type: OutOfClassType;
  duration_minutes: number;
  started_at: string; // ISO string
  due_at: string; // ISO string
  returned_at?: string; // ISO string
  actual_minutes?: number;
  late_return_minutes: number;
  return_method?: ReturnMethod;
  status: OutOfClassStatus;
  return_notes?: string;
  audited_by?: string;
  audit_reason?: string;
  idempotency_key: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ViolationCategory = 'ringan' | 'sedang' | 'berat' | 'prestasi';

export interface ViolationType {
  id: string;
  code: string;
  name: string;
  category: ViolationCategory;
  default_points: number;
  is_active: boolean;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface ViolationRecord {
  id: string;
  student_id: string;
  class_id: string;
  violation_type_id: string;
  type_name: string;
  category: ViolationCategory;
  points: number;
  notes: string;
  location?: string;
  evidence_photo_url?: string;
  recorded_by: string;
  recorded_at: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveRequest {
  id: string;
  student_id: string;
  class_id: string;
  type: 'Izin' | 'Sakit';
  start_date: string;
  end_date: string;
  reason: string;
  letter_file_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AppSettings {
  school_name: string;
  logo_url: string;
  background_url: string;
  accent_color: string;
  theme: 'light' | 'dark';
  tts_enabled: boolean;
  tts_rate: number;
  tts_pitch: number;
  tts_volume: number;
  tts_template_present: string;
  tts_template_late: string;
  tts_template_out_of_class: string;
  tts_template_overdue: string;
  // Discipline formula
  discipline_late_weight: number;
  discipline_alpha_weight: number;
  discipline_late_return_weight: number;
  discipline_full_attendance_bonus: number;
  // Out of class quotas & durations
  out_of_class_max_per_class: number;
  out_of_class_max_per_student_daily: number;
  out_of_class_bak_duration: number;
  out_of_class_bab_duration: number;
  out_of_class_other_duration: number;
  // Feature toggles
  toggle_allow_edit_violation_points: boolean;
  toggle_email_notifications: boolean;
  toggle_kiosk_mode: boolean;
  // Google Drive & Sheets Integration
  google_account_email?: string;
  google_account_name?: string;
  google_account_photo?: string;
  google_drive_folder_id?: string;
  google_drive_folder_url?: string;
  google_sheet_id?: string;
  google_sheet_url?: string;
  google_last_synced_at?: string;
  google_accounts?: Array<{
    email: string;
    name: string;
    photo?: string;
    connected_at: string;
    is_primary: boolean;
  }>;
  updated_at: string;
}

export interface NotificationSettings {
  email_enabled: boolean;
  trigger_late: boolean;
  trigger_alpha: boolean;
  trigger_leave: boolean;
  trigger_violation: boolean;
  trigger_warning_threshold: boolean;
  trigger_overdue_out_of_class: boolean;
  warning_threshold_points: number;
  subject_template: string;
  body_template: string;
  // Weekly homeroom recap per session settings (Admin-controlled)
  weekly_recap_enabled?: boolean;
  weekly_recap_day?: number; // 0=Minggu, 1=Senin, ..., 5=Jumat, 6=Sabtu
  weekly_recap_time?: string; // HH:mm (e.g. '15:00')
  weekly_recap_last_sent?: string;
  updated_at: string;
}

export interface NotificationLog {
  id: string;
  timestamp: string;
  student_id: string;
  student_name: string;
  recipient_email: string;
  trigger_type: string;
  status: 'sent' | 'failed' | 'skipped_no_email';
  error_message?: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actor_name: string;
  actor_role: string;
  action: string;
  entity: string;
  entity_id: string;
  old_values?: string;
  new_values?: string;
  reason?: string;
  ip_or_device?: string;
}

export interface DeltaChange {
  id: string;
  version: number;
  entity: string;
  entity_id: string;
  action: 'insert' | 'update' | 'delete';
  changed_at: string;
  data?: any;
}
