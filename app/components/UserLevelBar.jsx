'use client';
import { motion } from 'framer-motion';
import { Flame, Star, Zap } from 'lucide-react';

export default function UserLevelBar({ user }) {
  if (!user) return null;

  const xp = user.xp || 0;
  const level = Math.floor(xp / 100) + 1;
  const currentLevelXp = xp % 100;
  const progress = (currentLevelXp / 100) * 100;

  return (
    <div className="w-full bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-100 p-4">
      <div className="max-w-md mx-auto flex items-center justify-between gap-4">
        {/* Level Indicator */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="w-12 h-12 rotate-[-90deg]">
              <circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                className="text-slate-100"
              />
              <motion.circle
                cx="24"
                cy="24"
                r="20"
                stroke="currentColor"
                strokeWidth="4"
                fill="transparent"
                strokeDasharray="125.6"
                initial={{ strokeDashoffset: 125.6 }}
                animate={{ strokeDashoffset: 125.6 - (125.6 * progress) / 100 }}
                transition={{ duration: 1, ease: "easeOut" }}
                className="text-indigo-600"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="font-black text-slate-800 text-sm">{level}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Level</p>
            <p className="text-xs font-bold text-slate-700">{xp} XP</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-orange-50 px-3 py-1.5 rounded-full border border-orange-100">
            <Flame size={16} className="text-orange-500 fill-orange-500" />
            <span className="font-black text-orange-700 text-sm">{user.streak}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-50 px-3 py-1.5 rounded-full border border-yellow-100">
            <Zap size={16} className="text-yellow-500 fill-yellow-500" />
            <span className="font-black text-yellow-700 text-sm">{xp}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
