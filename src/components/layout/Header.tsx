import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import {
  Award,
  Sun,
  Moon,
  LogOut,
  Bell,
  Search,
  UserCheck,
  Menu,
  X,
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  Layers,
  Calendar,
  Trophy,
  Settings,
  FileCheck,
  FileText,
  History,
  ChevronRight,
} from 'lucide-react';
import { Avatar, Dropdown, DropdownItem } from '../ui/Avatar';
import { ConfirmDialog } from '../ui/Modal';

export const Header: React.FC = () => {
  const navigate = useNavigate();
  const { profile, logout } = useAuth();
  const { resolvedTheme, toggleTheme } = useTheme();
  const { showToast } = useToast();

  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

  React.useEffect(() => {
    const handleOpenDrawer = () => setIsMobileDrawerOpen(true);
    window.addEventListener('open-mobile-drawer', handleOpenDrawer);
    return () => window.removeEventListener('open-mobile-drawer', handleOpenDrawer);
  }, []);

  if (!profile) return null;

  const roleLabel = () => {
    switch (profile.role) {
      case 'admin':
        return 'Administrator';
      case 'teacher':
        return 'Guru Pembina';
      case 'student':
        return 'Siswa Olimpiade';
    }
  };

  const roleBadgeStyle = () => {
    switch (profile.role) {
      case 'admin':
        return 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800';
      case 'teacher':
        return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800';
      case 'student':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800';
    }
  };

  const handleConfirmLogout = async () => {
    setIsLogoutConfirmOpen(false);
    setIsMobileDrawerOpen(false);
    await logout();
    showToast('Anda telah berhasil keluar.', 'info');
    navigate('/login');
  };

  // Nav items per role
  const adminNav = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Siswa', path: '/admin/students', icon: GraduationCap },
    { name: 'Guru', path: '/admin/teachers', icon: Users },
    { name: 'Bank Soal', path: '/admin/questions', icon: BookOpen },
    { name: 'Paket Ujian', path: '/admin/exams', icon: Layers },
    { name: 'Materi Pembinaan', path: '/admin/materials', icon: FileText },
    { name: 'Jadwal', path: '/admin/schedules', icon: Calendar },
    { name: 'Hasil Ujian', path: '/admin/results', icon: FileCheck },
    { name: 'Ranking', path: '/admin/ranking', icon: Trophy },
    { name: 'Pengaturan', path: '/admin/settings', icon: Settings },
  ];

  const teacherNav = [
    { name: 'Dashboard', path: '/teacher', icon: LayoutDashboard },
    { name: 'Bank Soal', path: '/teacher/questions', icon: BookOpen },
    { name: 'Paket Ujian', path: '/teacher/exams', icon: Layers },
    { name: 'Materi Pembinaan', path: '/teacher/materials', icon: FileText },
    { name: 'Hasil Siswa', path: '/teacher/results', icon: FileCheck },
    { name: 'Ranking', path: '/teacher/ranking', icon: Trophy },
  ];

  const studentNav = [
    { name: 'Dashboard', path: '/student', icon: LayoutDashboard },
    { name: 'Ujian Saya', path: '/student/exams', icon: Layers },
    { name: 'Materi Pembinaan', path: '/student/materials', icon: FileText },
    { name: 'Hasil Ujian', path: '/student/results', icon: Award },
    { name: 'Riwayat Nilai', path: '/student/history', icon: History },
  ];

  const navItems =
    profile.role === 'admin'
      ? adminNav
      : profile.role === 'teacher'
      ? teacherNav
      : studentNav;

  const handleNavClick = (path: string) => {
    setIsMobileDrawerOpen(false);
    navigate(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Left: Mobile Menu Toggle Button (Visible < md) & Logo Branding */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(true)}
                aria-label="Buka menu navigasi"
                className="md:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-hidden"
              >
                <Menu className="w-5 h-5" />
              </button>

              <div
                className="flex items-center gap-2.5 shrink-0 cursor-pointer"
                onClick={() => navigate(`/${profile.role}`)}
              >
                <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs shadow-blue-600/25">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-slate-900 dark:text-slate-100 tracking-tight text-base sm:text-lg">
                      OLYMPIAD CBT
                    </span>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hidden sm:inline-block">
                      SD
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:block leading-none">
                    Sistem Ujian Pembinaan Olimpiade
                  </p>
                </div>
              </div>
            </div>

            {/* Center Search (Desktop) */}
            <div className="hidden lg:flex items-center flex-1 max-w-xs mx-6">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" />
                <input
                  type="text"
                  placeholder="Cari ujian atau menu..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-600 transition-colors"
                />
              </div>
            </div>

            {/* Right Tools: Theme Toggle, Notification & Profile */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Notification Icon */}
              <button
                type="button"
                onClick={() => showToast('Tidak ada pengumuman baru.', 'info')}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative"
                aria-label="Lihat notifikasi"
              >
                <Bell className="w-4 h-4" />
                <span className="w-2 h-2 rounded-full bg-blue-600 absolute top-1.5 right-1.5" />
              </button>

              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={toggleTheme}
                aria-label={resolvedTheme === 'dark' ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'}
                className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-600" />
                )}
              </button>

              {/* User Profile Dropdown */}
              <Dropdown
                trigger={
                  <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800 select-none">
                    <Avatar name={profile.displayName} src={profile.photoURL} size="sm" />
                    <div className="hidden md:block text-left">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate max-w-[120px] leading-tight">
                        {profile.displayName}
                      </div>
                      <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border ${roleBadgeStyle()}`}>
                        {roleLabel()}
                      </span>
                    </div>
                  </div>
                }
              >
                <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                    {profile.displayName}
                  </p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                    @{profile.username}
                  </p>
                </div>

                <div className="py-1">
                  <DropdownItem onClick={() => navigate(`/${profile.role}/profile`)}>
                    <UserCheck className="w-4 h-4" />
                    <span>Profil Pengguna</span>
                  </DropdownItem>
                </div>

                <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                  <DropdownItem onClick={() => setIsLogoutConfirmOpen(true)} destructive>
                    <LogOut className="w-4 h-4" />
                    <span>Keluar Akun</span>
                  </DropdownItem>
                </div>
              </Dropdown>
            </div>
          </div>
        </div>
      </header>

      {/* ─────────────────────────────────────────────────────────────
          MOBILE SLIDE-OVER NAVIGATION DRAWER (< md)
      ───────────────────────────────────────────────────────────── */}
      {isMobileDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setIsMobileDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-80 max-w-[85vw] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 flex flex-col h-full shadow-2xl z-10 animate-in slide-in-from-left duration-300 border-r border-slate-200 dark:border-slate-800">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center text-white font-black shadow-md shadow-blue-600/25">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight">
                    OLYMPIAD CBT
                  </h3>
                  <span className={`inline-block text-[9px] font-bold px-1.5 py-0.2 rounded border ${roleBadgeStyle()}`}>
                    {roleLabel()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Identity Banner */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              <Avatar name={profile.displayName} src={profile.photoURL} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-slate-900 dark:text-slate-100 truncate">
                  {profile.displayName}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  @{profile.username}
                </p>
              </div>
            </div>

            {/* Navigation Links */}
            <div className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
              <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Menu Utama ({profile.role.toUpperCase()})
              </div>

              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/admin' || item.path === '/teacher' || item.path === '/student'}
                    onClick={() => handleNavClick(item.path)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all select-none ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-black'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`
                    }
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.name}</span>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60" />
                  </NavLink>
                );
              })}
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => handleNavClick(`/${profile.role}/profile`)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>Profil Saya</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              </button>

              <button
                type="button"
                onClick={() => setIsLogoutConfirmOpen(true)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <LogOut className="w-4 h-4" />
                  <span>Keluar Akun</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        onConfirm={handleConfirmLogout}
        title="Konfirmasi Keluar"
        message="Apakah Anda yakin ingin keluar dari sesi aplikasi OLYMPIAD CBT?"
        confirmLabel="Keluar"
        cancelLabel="Batal"
        isDestructive={true}
      />
    </>
  );
};
