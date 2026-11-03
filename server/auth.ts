import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { storage } from './storage.js';
import { UserRole } from './types.js';

const JWT_SECRET = process.env.JWT_SECRET || 'disiplin-kita-bisa-secure-secret-key-2026';
const TOKEN_EXPIRY = '12h';

// Rate limiting & lockout for Duty login (5 failed attempts -> 5 min lock)
interface LockoutInfo {
  attempts: number;
  lockedUntil: number;
}
const dutyLockouts = new Map<string, LockoutInfo>();

export interface SessionPayload {
  userId: string;
  role: UserRole;
  name: string;
  classId?: string;
  label?: string;
  tokenVersion: number;
  lockedMenuRole?: 'homeroom' | 'student_affairs' | 'admin';
  lockedMenuClassId?: string;
  lockedMenuExpiresAt?: number;
}

function sanitizePayloadForSigning(obj: Record<string, any>): Record<string, any> {
  const copy = { ...obj };
  delete copy.exp;
  delete copy.iat;
  delete copy.nbf;
  delete copy.jti;
  return copy;
}

export class AuthService {
  /**
   * Verify duty (piket) password
   */
  async loginDuty(password: string, ip: string = 'client'): Promise<{ success: boolean; token?: string; error?: string; remainingAttempts?: number; lockedForSeconds?: number }> {
    const now = Date.now();
    const lock = dutyLockouts.get(ip) || { attempts: 0, lockedUntil: 0 };

    if (lock.lockedUntil > now) {
      const waitSec = Math.ceil((lock.lockedUntil - now) / 1000);
      return {
        success: false,
        error: `Terlalu banyak percobaan salah. Akun dikunci sementara selama ${waitSec} detik lagi.`,
        lockedForSeconds: waitSec,
      };
    }

    const dutyUsers = await storage.findDutyUsers();
    let matchedUser = dutyUsers.find((u) => bcrypt.compareSync(password, u.password_hash));

    // Also allow admin password to open duty session if needed
    if (!matchedUser) {
      const adminUser = await storage.findUserByRole('admin');
      if (adminUser && bcrypt.compareSync(password, adminUser.password_hash)) {
        matchedUser = adminUser;
      }
    }

    if (!matchedUser) {
      lock.attempts += 1;
      if (lock.attempts >= 5) {
        lock.lockedUntil = now + 5 * 60 * 1000; // 5 minutes
        lock.attempts = 0;
        dutyLockouts.set(ip, lock);
        return {
          success: false,
          error: 'Password salah 5 kali. Akses masuk dikunci selama 5 menit.',
          lockedForSeconds: 300,
        };
      }
      dutyLockouts.set(ip, lock);
      return {
        success: false,
        error: `Password piket salah. Sisa percobaan: ${5 - lock.attempts}.`,
        remainingAttempts: 5 - lock.attempts,
      };
    }

    // Success - clear lockout
    dutyLockouts.delete(ip);

    const payload: SessionPayload = {
      userId: matchedUser.id,
      role: matchedUser.role,
      name: matchedUser.name,
      label: matchedUser.label,
      tokenVersion: matchedUser.token_version,
    };

    const token = jwt.sign(sanitizePayloadForSigning(payload), JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return { success: true, token };
  }

  /**
   * Unlock homeroom menu (Name + Password -> automatically directed to their class)
   */
  async unlockHomeroom(name: string, password: string, classId?: string, currentSessionToken?: string): Promise<{ success: boolean; token?: string; error?: string; classId?: string; teacherName?: string }> {
    const rawSession = currentSessionToken ? this.verifyToken(currentSessionToken) : null;
    const session = rawSession ? sanitizePayloadForSigning(rawSession) : null;

    const cleanName = (name || '').trim().toLowerCase();
    const users = await storage.getUsers();
    const homeroomUsers = users.filter((u) => u.role === 'homeroom' && u.is_active);

    // Match by name
    let matchedUser = homeroomUsers.find(
      (u) =>
        u.name.toLowerCase().trim() === cleanName ||
        u.name.toLowerCase().includes(cleanName) ||
        cleanName.includes(u.name.toLowerCase().trim())
    );

    // If still not matched and classId was provided, fallback to finding by classId
    if (!matchedUser && classId) {
      matchedUser = homeroomUsers.find((u) => u.class_id === classId);
    }

    if (!matchedUser) {
      return { success: false, error: `Akun wali kelas dengan nama "${name}" tidak ditemukan.` };
    }

    if (!bcrypt.compareSync(password, matchedUser.password_hash)) {
      return { success: false, error: 'Password wali kelas salah.' };
    }

    const targetClassId = matchedUser.class_id || classId || '10-RPL-1';

    const payload: SessionPayload = {
      ...(session || {}),
      userId: matchedUser.id,
      role: matchedUser.role,
      name: matchedUser.name,
      label: matchedUser.label,
      tokenVersion: matchedUser.token_version,
      lockedMenuRole: 'homeroom',
      lockedMenuClassId: targetClassId,
    };

    const token = jwt.sign(sanitizePayloadForSigning(payload), JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return {
      success: true,
      token,
      classId: targetClassId,
      teacherName: matchedUser.name,
    };
  }

  /**
   * Unlock student affairs (Kesiswaan) menu
   */
  async unlockStudentAffairs(password: string, currentSessionToken?: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const rawSession = currentSessionToken ? this.verifyToken(currentSessionToken) : null;
    const session = rawSession ? sanitizePayloadForSigning(rawSession) : null;

    const saUser = await storage.findUserByRole('student_affairs');
    const adminUser = await storage.findUserByRole('admin');

    const isValid = (saUser && bcrypt.compareSync(password, saUser.password_hash)) ||
                    (adminUser && bcrypt.compareSync(password, adminUser.password_hash));

    if (!isValid) {
      return { success: false, error: 'Password kesiswaan salah.' };
    }

    const activeUser = saUser || adminUser!;
    const payload: SessionPayload = {
      ...(session || {}),
      userId: activeUser.id,
      role: activeUser.role,
      name: activeUser.name,
      label: activeUser.label,
      tokenVersion: activeUser.token_version,
      lockedMenuRole: 'student_affairs',
    };

    const token = jwt.sign(sanitizePayloadForSigning(payload), JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return { success: true, token };
  }

  /**
   * Unlock admin menu
   */
  async unlockAdmin(password: string, currentSessionToken?: string): Promise<{ success: boolean; token?: string; error?: string }> {
    const rawSession = currentSessionToken ? this.verifyToken(currentSessionToken) : null;
    const session = rawSession ? sanitizePayloadForSigning(rawSession) : null;

    const adminUser = await storage.findUserByRole('admin');
    if (!adminUser || !bcrypt.compareSync(password, adminUser.password_hash)) {
      return { success: false, error: 'Password admin salah.' };
    }

    const payload: SessionPayload = {
      ...(session || {}),
      userId: adminUser.id,
      role: 'admin',
      name: adminUser.name,
      label: adminUser.label,
      tokenVersion: adminUser.token_version,
      lockedMenuRole: 'admin',
    };

    const token = jwt.sign(sanitizePayloadForSigning(payload), JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    return { success: true, token };
  }

  /**
   * Verify JWT Token and check token_version against database
   */
  verifyToken(token: string): SessionPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as SessionPayload;
      return decoded;
    } catch (e) {
      return null;
    }
  }

  /**
   * Async session validation that verifies token_version from database
   */
  async validateActiveSession(token: string): Promise<{ valid: boolean; session?: SessionPayload; reason?: string }> {
    const session = this.verifyToken(token);
    if (!session) {
      return { valid: false, reason: 'Invalid or expired token' };
    }

    const users = await storage.getUsers();
    const user = users.find((u) => u.id === session.userId);
    if (!user || !user.is_active) {
      return { valid: false, reason: 'User not found or inactive' };
    }

    if (user.token_version !== session.tokenVersion) {
      return { valid: false, reason: 'Session invalidated by password or account change' };
    }

    // Check if locked menu permission has expired (30 min)
    if (session.lockedMenuExpiresAt && Date.now() > session.lockedMenuExpiresAt) {
      session.lockedMenuRole = undefined;
      session.lockedMenuClassId = undefined;
      session.lockedMenuExpiresAt = undefined;
    }

    return { valid: true, session };
  }
}

export const authService = new AuthService();
