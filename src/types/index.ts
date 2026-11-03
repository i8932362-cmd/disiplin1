import {
  User,
  Student,
  SchoolClass,
  AttendanceSession,
  AttendanceRecord,
  OutOfClassRecord,
  ViolationType,
  ViolationRecord,
  LeaveRequest,
  AppSettings,
  NotificationSettings,
  NotificationLog,
  AuditLog,
  DeltaChange,
  AttendanceStatus,
  OutOfClassType,
  OutOfClassStatus,
  ViolationCategory,
} from '../../server/types.js';

export type {
  User,
  Student,
  SchoolClass,
  AttendanceSession,
  AttendanceRecord,
  OutOfClassRecord,
  ViolationType,
  ViolationRecord,
  LeaveRequest,
  AppSettings,
  NotificationSettings,
  NotificationLog,
  AuditLog,
  DeltaChange,
  AttendanceStatus,
  OutOfClassType,
  OutOfClassStatus,
  ViolationCategory,
};

export type ActiveTab =
  | 'attendance'
  | 'out_of_class'
  | 'violations'
  | 'dashboard'
  | 'homeroom'
  | 'student_affairs'
  | 'admin';

export interface AuthSession {
  token: string;
  userId: string;
  role: string;
  name: string;
  classId?: string;
  label?: string;
  lockedMenuRole?: 'homeroom' | 'student_affairs' | 'admin';
  lockedMenuClassId?: string;
  lockedMenuExpiresAt?: number;
}

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error';
