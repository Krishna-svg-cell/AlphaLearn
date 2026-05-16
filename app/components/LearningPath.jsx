'use client';
import { motion } from 'framer-motion';
import { CheckCircle, Play, Lock, BookOpen, Star, Zap, PenTool, RotateCcw } from 'lucide-react';

export default function LearningPath({ mission, onStartNode, completedSections = [] }) {
  if (!mission || !mission.mission) return null;

  const sections = [
    { id: 'meaning', label: 'Words', icon: '📚', color: 'bg-indigo-500' },
    { id: 'synonym', label: 'Synonyms', icon: '🔗', color: 'bg-emerald-500' },
    { id: 'antonym', label: 'Antonyms', icon: '🔄', color: 'bg-pink-500' },
    { id: 'grammar', label: 'Grammar', icon: '✏️', color: 'bg-amber-500' },
    { id: 'syllabus', label: 'Syllabus', icon: '📖', color: 'bg-teal-500' },
    { id: 'sentence', label: 'Sentences', icon: '🔤', color: 'bg-purple-500' },
  ].filter(s => {
    const list = s.id === 'sentence' ? (mission.mission.sentences || []) : (mission.mission[s.id] || []);
    return list.length > 0;
  });

  if (sections.length === 0) return null;

  // Determine which node is currently active
  const isMissionCompleted = mission.status?.is_completed;
  let activeIndex = isMissionCompleted ? -1 : 0; // In this version, we start the whole flow, but we can visualize it.
  
  // Since the current mission flow is all-at-once, we'll show all as "Available" or "Completed"
  
  return (
    <div className="flex flex-col items-center py-8 space-y-12 relative">
      {/* Background connecting line */}
      <div className="absolute top-0 bottom-0 w-2 bg-slate-200 left-1/2 -translate-x-1/2 -z-10 rounded-full" />

      {sections.map((section, index) => {
        const isCompleted = isMissionCompleted;
        const isNext = !isCompleted && index === 0; // Simplification for now
        
        // S-curve offset
        const xOffset = index % 2 === 0 ? 'translateX(40px)' : 'translateX(-40px)';
        
        return (
          <div key={section.id} className="relative flex flex-col items-center" style={{ transform: xOffset }}>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => !isCompleted && onStartNode(section.id)}
              className={`w-20 h-20 rounded-[28px] shadow-lg flex items-center justify-center relative transition-all ${
                isCompleted 
                ? 'bg-emerald-500 text-white' 
                : isNext 
                  ? `${section.color} text-white ring-8 ring-indigo-100` 
                  : 'bg-white border-4 border-slate-200 text-slate-400'
              }`}
            >
              <span className="text-3xl">{section.icon}</span>
              
              {isCompleted && (
                <div className="absolute -top-2 -right-2 bg-white text-emerald-500 rounded-full p-1 shadow-md">
                  <CheckCircle size={20} fill="currentColor" className="text-white" />
                </div>
              )}
              
              {isNext && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -inset-2 rounded-[32px] border-2 border-indigo-400 opacity-50"
                />
              )}
            </motion.button>
            
            <div className={`mt-3 font-black text-sm px-4 py-1.5 rounded-full shadow-sm border ${
              isCompleted 
              ? 'bg-emerald-50 border-emerald-100 text-emerald-700' 
              : isNext 
                ? 'bg-indigo-600 border-indigo-700 text-white' 
                : 'bg-white border-slate-200 text-slate-500'
            }`}>
              {section.label}
            </div>
          </div>
        );
      })}

      {/* Completion Trophy */}
      <div className="relative pt-8">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${isMissionCompleted ? 'bg-yellow-400 shadow-xl shadow-yellow-200' : 'bg-slate-200 text-slate-400'}`}>
          <span className="text-5xl">🏆</span>
        </div>
        <p className="text-center font-black mt-4 text-slate-800">Mission Reward</p>
      </div>
    </div>
  );
}
