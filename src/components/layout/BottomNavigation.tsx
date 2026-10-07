import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  LayoutDashboard,
  Layers,
  Award,
  BookOpen,
  GraduationCap,
  FileText,
  Menu,
} from 'lucide-react';

export const BottomNavigation: React.FC = () => {
  const { profile } = useAuth();

  if (!profile) return null;

  const studentItems = [
    { name: 'Home', path: '/student', icon: LayoutDashboard },
    { name: 'Ujian', path: '/student/exams', icon: Layers },
    { name: 'Materi', path: '/student/materials', icon: FileText },
    { name: 'Hasil', path: '/student/results', icon: Award },
  ];

  const teacherItems = [
    { name: 'Home', path: '/teacher', icon: LayoutDashboard },
    { name: 'Soal', path: '/teacher/questions', icon: BookOpen },
    { name: 'Ujian', path: '/teacher/exams', icon: Layers },
    { name: 'Materi', path: '/teacher/materials', icon: FileText },
  ];

  const adminItems = [
    { name: 'Home', path: '/admin', icon: LayoutDashboard },
    { name: 'Data', path: '/admin/students', icon: GraduationCap },
    { name: 'Ujian', path: '/admin/exams', icon: Layers },
    { name: 'Materi', path: '/admin/materials', icon: FileText },
  ];

  const items =
    profile.role === 'admin'
      ? adminItems
      : profile.role === 'teacher'
      ? teacherItems
      : studentItems;

  const openDrawer = () => {
    window.dispatchEvent(new CustomEvent('open-mobile-drawer'));
  };

  return (
    <nav
      aria-label="Navigasi Bawah Ponsel"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-lg pb-safe"
    >
      <div className="grid grid-cols-5 h-16 max-w-lg mx-auto">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/admin' || item.path === '/teacher' || item.path === '/student'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 transition-colors select-none ${
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1 rounded-lg transition-transform ${isActive ? 'scale-110' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] tracking-tight truncate max-w-[56px]">{item.name}</span>
                </>
              )}
            </NavLink>
          );
        })}

        {/* 5th Button: Open Full Mobile Menu Drawer */}
        <button
          type="button"
          onClick={openDrawer}
          className="flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors select-none"
        >
          <div className="p-1 rounded-lg">
            <Menu className="w-5 h-5" />
          </div>
          <span className="text-[10px] tracking-tight">Menu</span>
        </button>
      </div>
    </nav>
  );
};
