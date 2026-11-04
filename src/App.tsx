import React, { useState, Suspense } from 'react';
import { AppProvider, useApp } from './context/AppContext.js';
import { Sidebar } from './components/layout/Sidebar.js';
import { Header } from './components/layout/Header.js';
import { DutyLoginScreen, SecondaryUnlockModal } from './components/modals/AuthLoginModal.js';
import { CheckCircle2, AlertCircle, Info, X, Lock } from 'lucide-react';

// Lazy-loaded views for instant initial load time and code-splitting
const DashboardView = React.lazy(() => import('./views/DashboardView.js').then((m) => ({ default: m.DashboardView })));
const AttendanceView = React.lazy(() => import('./views/AttendanceView.js').then((m) => ({ default: m.AttendanceView })));
const OutOfClassView = React.lazy(() => import('./views/OutOfClassView.js').then((m) => ({ default: m.OutOfClassView })));
const ViolationsView = React.lazy(() => import('./views/ViolationsView.js').then((m) => ({ default: m.ViolationsView })));
const HomeroomView = React.lazy(() => import('./views/HomeroomView.js').then((m) => ({ default: m.HomeroomView })));
const StudentAffairsView = React.lazy(() => import('./views/StudentAffairsView.js').then((m) => ({ default: m.StudentAffairsView })));
const AdminView = React.lazy(() => import('./views/AdminView.js').then((m) => ({ default: m.AdminView })));

const ViewLoadingSkeleton: React.FC = () => (
  <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-pulse">
    <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-1/4 mb-4" />
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      <div className="lg:col-span-2 h-64 bg-slate-200 dark:bg-slate-800 rounded-xl" />
    </div>
  </div>
);

const LockedRolePlaceholder: React.FC<{
  role: 'homeroom' | 'student_affairs' | 'admin';
  onUnlock: () => void;
}> = ({ role, onUnlock }) => {
  const titles = {
    homeroom: 'Menu Wali Kelas Terkunci',
    student_affairs: 'Menu Kesiswaan Terkunci',
    admin: 'Menu Administrator Terkunci',
  };
  const descriptions = {
    homeroom: 'Menu Wali Kelas dilindungi kata sandi. Masukkan nama dan kata sandi Anda untuk mengakses kelas yang Anda ampu.',
    student_affairs: 'Menu Kesiswaan dilindungi kata sandi khusus. Masukkan kata sandi kesiswaan untuk melanjutkan.',
    admin: 'Menu Administrator berisi data dan konfigurasi sensitif. Masukkan kata sandi admin untuk mengakses.',
  };

  return (
    <div className="p-6 max-w-md mx-auto text-center my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs">
      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 mb-3.5">
        <Lock className="w-6 h-6" />
      </div>
      <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">
        {titles[role]}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
        {descriptions[role]}
      </p>
      <button
        onClick={onUnlock}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors shadow-xs"
      >
        <Lock className="w-3.5 h-3.5" />
        <span>Buka Akses dengan Kata Sandi</span>
      </button>
    </div>
  );
};

const MainAppContent: React.FC = () => {
  const { session, activeTab, setActiveTab, toasts, dismissToast } = useApp();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [unlockRole, setUnlockRole] = useState<'homeroom' | 'student_affairs' | 'admin' | null>(null);

  // Bagian 3 Alur 1: If no session, show ONLY the Duty Login Screen
  if (!session) {
    return <DutyLoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar Navigation */}
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenUnlockModal={(role) => setUnlockRole(role)}
      />

      {/* Main Body Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Sticky Header */}
        <Header onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />

        {/* Dynamic View Content wrapped in Suspense for zero blank screen */}
        <main className="flex-1 pb-12">
          <Suspense fallback={<ViewLoadingSkeleton />}>
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'attendance' && <AttendanceView />}
            {activeTab === 'out_of_class' && <OutOfClassView />}
            {activeTab === 'violations' && <ViolationsView />}
            {activeTab === 'homeroom' && (
              session?.lockedMenuRole === 'homeroom' ? (
                <HomeroomView />
              ) : (
                <LockedRolePlaceholder
                  role="homeroom"
                  onUnlock={() => setUnlockRole('homeroom')}
                />
              )
            )}
            {activeTab === 'student_affairs' && (
              session?.lockedMenuRole === 'student_affairs' ? (
                <StudentAffairsView />
              ) : (
                <LockedRolePlaceholder
                  role="student_affairs"
                  onUnlock={() => setUnlockRole('student_affairs')}
                />
              )
            )}
            {activeTab === 'admin' && (
              session?.lockedMenuRole === 'admin' ? (
                <AdminView />
              ) : (
                <LockedRolePlaceholder
                  role="admin"
                  onUnlock={() => setUnlockRole('admin')}
                />
              )
            )}
          </Suspense>
        </main>
      </div>

      {/* Password Unlock Modal for Wali Kelas, Kesiswaan, Admin */}
      <SecondaryUnlockModal
        role={unlockRole}
        onClose={() => setUnlockRole(null)}
        onSuccess={() => {
          if (unlockRole) setActiveTab(unlockRole);
        }}
      />

      {/* Toast Notifications */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-3 rounded-lg shadow-lg border text-xs animate-in slide-in-from-bottom-2 duration-150 ${
              toast.type === 'success'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              {toast.type === 'info' && <Info className="w-4 h-4 text-sky-400 shrink-0" />}
              <span className="leading-tight">{toast.message}</span>
            </div>
            <button
              onClick={() => dismissToast(toast.id)}
              className="text-white/70 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
