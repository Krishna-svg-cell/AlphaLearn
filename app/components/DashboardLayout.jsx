'use client';
import { useRouter } from 'next/navigation';
import { LogOut, Menu, X, Bell, User, ChevronDown, BarChart2, RotateCcw, Award } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

export default function DashboardLayout({ children, subtitle, tabs, activeTab, onTabChange, roleColor = 'indigo' }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [schoolConfig, setSchoolConfig] = useState(null);
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [unread, setUnread] = useState({ messages: 0 });
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const mobileProfileRef = useRef(null);

  useEffect(() => {
    setMounted(true);
    const token = localStorage.getItem('token');
    if (token) {
      axios.get('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => {
            setUser(res.data);
            if (res.data.school_id) {
                axios.get(`/api/school/config?school_id=${res.data.school_id}`)
                .then(cfg => setSchoolConfig(cfg.data))
                .catch(() => {});
            }
            axios.get('/api/unread-counts', { headers: { Authorization: `Bearer ${token}` } })
                .then(u => setUnread({ messages: u.data.unreadMessages }))
                .catch(() => {});
        })
        .catch(() => {});
    }
  }, []);

  const gradients = {
    indigo: 'from-indigo-600 to-purple-600',
    emerald: 'from-emerald-500 to-teal-500',
    blue: 'from-blue-500 to-cyan-500',
    orange: 'from-orange-500 to-red-500',
    amber: 'from-amber-500 to-orange-500',
  };
  const activeColors = {
    indigo: 'bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300',
    blue: 'bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300',
    orange: 'bg-orange-50 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300',
    amber: 'bg-amber-50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300',
  };
  const dotColors = {
    indigo: 'bg-indigo-500',
    emerald: 'bg-emerald-500',
    blue: 'bg-blue-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
  };

  const grad = gradients[roleColor] || gradients.indigo;
  const activeColor = activeColors[roleColor] || activeColors.indigo;
  const dotColor = dotColors[roleColor] || dotColors.indigo;

  const roleLabels = {
    STUDENT: 'Student',
    STAFF: 'Staff',
    PRINCIPAL: 'Principal',
    PARENT: 'Parent',
    ADMIN: 'Admin',
  };

  const handleLogout = () => {
    localStorage.clear();
    // Clear the authentication cookie
    document.cookie = "token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push('/');
  };

  const currentTheme = theme === 'system' ? systemTheme : theme;
  const toggleTheme = () => setTheme(currentTheme === 'dark' ? 'light' : 'dark');

  // Close profile dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      const inDesktop = profileRef.current?.contains(e.target);
      const inMobile = mobileProfileRef.current?.contains(e.target);
      if (!inDesktop && !inMobile) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const brandName = schoolConfig?.name || 'ALPHALEARN';
  const brandLogo = schoolConfig?.logo_url || null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">

      {/* ===== DESKTOP SIDEBAR ===== */}
      <aside className="fixed top-0 left-0 bottom-0 w-[260px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 hidden md:flex flex-col z-40 transition-colors duration-300">
        {/* Brand */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            {brandLogo ? (
                <img src={brandLogo} alt="Logo" className="w-9 h-9 rounded-xl object-cover shadow-sm flex-shrink-0" />
            ) : (
                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm flex-shrink-0`}>
                  <span className="text-white font-black text-sm">A</span>
                </div>
            )}
            <div>
              <h1 className={`text-lg font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${grad} line-clamp-1`} title={brandName}>
                {brandName}
              </h1>
            </div>
          </div>
          {user && (
            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <div className={`w-2 h-2 rounded-full ${dotColor} flex-shrink-0`} />
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {roleLabels[user.role] || user.role}
                </p>
              </div>
              {user.school_name && (
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{user.school_name}</p>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{user.username}</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1 custom-scrollbar">
          <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest px-3 mb-2 mt-2">Navigation</p>
          {tabs.map(([k, l, Icon]) => (
            <button key={k} onClick={() => onTabChange(k)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${activeTab === k ? activeColor : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}>
              <div className="relative">
                <Icon size={18} className={activeTab === k ? '' : 'opacity-70'} />
                {k === 'messages' && unread.messages > 0 && <span className="absolute -top-1 -right-1 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span></span>}
              </div>
              <span>{l}</span>
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-2">
          {mounted && (
            <button onClick={toggleTheme} className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
              <span className="flex items-center gap-3"><Sun size={18} className="dark:hidden" /><Moon size={18} className="hidden dark:block" /> {currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>
          )}
          <button onClick={handleLogout}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors border border-rose-100 dark:border-rose-500/20 mt-2">
            <LogOut size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ===== DESKTOP TOP BAR ===== */}
      <header className="hidden md:flex fixed top-0 left-[260px] right-0 z-30 h-16 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 items-center justify-end px-6 transition-colors duration-300">
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-sm shadow-sm`}>
              {user ? user.username[0].toUpperCase() : <User size={16} />}
            </div>
            {user && (
              <div className="text-left hidden lg:block">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-tight">{user.username}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{roleLabels[user.role] || user.role}</p>
              </div>
            )}
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown */}
          {profileOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] w-64 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-2 z-50 slide-up">
              {user && (
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-base shadow-sm`}>
                      {user.username[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{user.username}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{roleLabels[user.role] || user.role}{user.school_name ? ` · ${user.school_name}` : ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-3 mt-2">
                    <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800 rounded-xl py-1.5">
                      <p className="text-xs font-bold text-orange-500">🔥 {user.streak || 0}</p>
                      <p className="text-[10px] text-slate-400">Streak</p>
                    </div>
                    <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800 rounded-xl py-1.5">
                      <p className="text-xs font-bold text-yellow-500">⭐ {user.xp || 0}</p>
                      <p className="text-[10px] text-slate-400">XP</p>
                    </div>
                  </div>
                </div>
              )}
              <div className="py-1">
                <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('profile'), 50); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <User size={16} className="text-indigo-500" /> My Profile
                </button>
                <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('track'), 50); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <BarChart2 size={16} className="text-emerald-500" /> Progress
                </button>
                <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('review'), 50); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <RotateCcw size={16} className="text-blue-500" /> Review
                </button>
                <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('messages'), 50); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Bell size={16} className="text-cyan-500" /> Messages
                </button>
                <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('badges'), 50); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                  <Award size={16} className="text-purple-500" /> My Badges
                </button>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                {mounted && (
                  <button onClick={() => { toggleTheme(); setProfileOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <Sun size={16} className="dark:hidden" /><Moon size={16} className="hidden dark:block" />
                    {currentTheme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                )}
                <button onClick={() => { handleLogout(); setProfileOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                  <LogOut size={16} /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ===== MOBILE HEADER ===== */}
      <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {brandLogo ? (
                <img src={brandLogo} alt="Logo" className="w-8 h-8 rounded-xl object-cover shadow-sm flex-shrink-0" />
            ) : (
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${grad} flex items-center justify-center shadow-sm`}>
                  <span className="text-white font-black text-xs">A</span>
                </div>
            )}
            <div>
              <h1 className={`text-base font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r ${grad} leading-tight line-clamp-1`} title={brandName}>{brandName}</h1>
              {user?.school_name && <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 leading-none mt-0.5 truncate max-w-[180px]">{user.school_name}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {mounted && (
                <button onClick={toggleTheme} className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400">
                    {currentTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                </button>
            )}
            {user && (
              <div className="relative" ref={mobileProfileRef}>
                <button onClick={() => setProfileOpen(!profileOpen)} className={`w-8 h-8 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center text-white font-bold text-xs shadow-sm`}>
                  {user.username[0].toUpperCase()}
                </button>
                {profileOpen && (
                  <div className="absolute right-0 top-[calc(100%+8px)] w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl py-2 z-50 slide-up">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{user.username}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{roleLabels[user.role] || user.role}{user.school_name ? ` · ${user.school_name}` : ''}</p>
                      <div className="flex gap-3 mt-2">
                        <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800 rounded-lg py-1">
                          <p className="text-[11px] font-bold text-orange-500">🔥 {user.streak || 0}</p>
                        </div>
                        <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800 rounded-lg py-1">
                          <p className="text-[11px] font-bold text-yellow-500">⭐ {user.xp || 0}</p>
                        </div>
                      </div>
                    </div>
                    <div className="py-1">
                      <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('profile'), 50); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <User size={15} className="text-indigo-500" /> My Profile
                      </button>
                      <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('track'), 50); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <BarChart2 size={15} className="text-emerald-500" /> Progress
                      </button>
                      <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('review'), 50); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <RotateCcw size={15} className="text-blue-500" /> Review
                      </button>
                      <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('messages'), 50); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <Bell size={15} className="text-cyan-500" /> Messages
                      </button>
                      <button onClick={() => { setProfileOpen(false); setTimeout(() => onTabChange('badges'), 50); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <Award size={15} className="text-purple-500" /> My Badges
                      </button>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-1">
                      {mounted && (
                        <button onClick={() => { toggleTheme(); setProfileOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <Sun size={14} className="dark:hidden" /><Moon size={14} className="hidden dark:block" />
                          {currentTheme === 'dark' ? 'Light' : 'Dark'} Mode
                        </button>
                      )}
                      <button onClick={() => { handleLogout(); setProfileOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors">
                        <LogOut size={15} /> Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <main className="md:ml-[260px] pb-24 md:pb-8 pt-20 md:pt-[88px] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>

      {/* ===== MOBILE BOTTOM NAV ===== */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe pt-2 px-2 flex justify-around md:hidden">
        {tabs.map(([k, l, Icon]) => (
          <button key={k} onClick={() => onTabChange(k)}
            className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-colors ${activeTab === k ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}>
            <div className="relative">
              <Icon size={22} className={`mb-1 transition-transform ${activeTab === k ? 'scale-110' : ''}`} />
              {k === 'messages' && unread.messages > 0 && <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-white dark:border-slate-900"></span></span>}
            </div>
            <span className="text-[10px] font-bold tracking-wide">{l}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
