'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Flame, Star, Bell, CheckCircle, TrendingUp, ArrowLeft, ChevronDown, ChevronUp, Award, ArrowRight, Calendar, BookOpen, AlertTriangle, Brain } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

export default function ParentDashboard() {
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotif, setShowNotif] = useState(false);
  const [activeView, setActiveView] = useState('home');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayAnswers, setDayAnswers] = useState({});
  const [subjectProgress, setSubjectProgress] = useState([]);
  const [riskAnalysis, setRiskAnalysis] = useState(null);
  const router = useRouter();

  // Resilient API fetcher — retries on 500/network errors (Neon cold-start recovery)
  const fetchWithRetry = async (url, headers, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.get(url, { headers });
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) throw err;
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          continue;
        }
        throw err;
      }
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return router.push('/');
    const h = { Authorization: `Bearer ${token}` };

    const loadDashboard = async () => {
      try {
        const res = await fetchWithRetry('/api/parent/student', h);
        setStudent(res.data.student);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.clear(); router.push('/');
          return;
        }
        setError('Failed to load child data. Database connection may have dropped.');
      }
      setLoading(false);

      // Non-critical
      axios.get('/api/notifications', { headers: h }).then(r => setNotifications(r.data)).catch(() => {});
      axios.get('/api/parent/predictive-analytics', { headers: h }).then(r => setRiskAnalysis(r.data)).catch(() => {});
    };
    loadDashboard();
  }, [router]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    setActiveView('history');
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get('/api/parent/student/history', { headers: h });
      setHistory(res.data);
    } catch(e) {}
    setLoadingHistory(false);
  };
  

  const toggleDay = async (date) => {
    if (expandedDay === date) { setExpandedDay(null); return; }
    setExpandedDay(date);
    if (!dayAnswers[date]) {
      try {
        const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await axios.get(`/api/parent/student/history/${date}`, { headers: h });
        setDayAnswers(prev => ({ ...prev, [date]: res.data }));
      } catch(e) {}
    }
  };

  const tabs = [
    ['home', 'Home', Award],
    ['subjects', 'Subjects', BookOpen],
    ['history', 'History', TrendingUp]
  ];

  const handleTabChange = (t) => {
    setActiveView(t);
    if (t === 'history') loadHistory();
    if (t === 'subjects') {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      axios.get('/api/parent/subject-progress', { headers: h }).then(r => setSubjectProgress(r.data)).catch(() => setSubjectProgress([]));
    }
  };

  if (error) {
    return (
      <DashboardLayout subtitle="Parent Dashboard" tabs={tabs} activeTab={activeView} onTabChange={handleTabChange} roleColor="amber">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <p className="font-bold text-lg text-red-500 mb-2">Error</p>
          <p className="font-bold text-lg text-slate-800">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-xl font-bold">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  if (loading) {
    return (
      <DashboardLayout subtitle="Parent Dashboard" tabs={tabs} activeTab={activeView} onTabChange={handleTabChange} roleColor="amber">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mb-4"></div>
          <p className="font-bold text-lg">Loading child data...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout subtitle="Parent Dashboard" tabs={tabs} activeTab={activeView} onTabChange={handleTabChange} roleColor="amber">

      {activeView === 'home' && (
        <div className="space-y-5 slide-up">
          <div className="section-header">
            <h1 className="section-title">Child Overview</h1>
          </div>

          {/* Student Card */}
          {student ? (
            <div className="relative overflow-hidden rounded-[24px] p-6 text-white shadow-xl" style={{background:'linear-gradient(135deg,#92400e,#d97706,#f59e0b)'}}>
              <div className="absolute top-[-40px] right-[-40px] w-[150px] h-[150px] rounded-full opacity-20" style={{background:'white'}} />
              <div className="relative z-10 flex items-center gap-4 mb-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-3xl border-2" style={{background:'rgba(255,255,255,0.25)',borderColor:'rgba(255,255,255,0.35)'}}>
                  {student.username[0].toUpperCase()}
                </div>
                <div>
                  <h2 className="font-black text-xl">{student.username}</h2>
                  <p className="text-amber-200 text-sm">
                    {student.school_name || 'AlphaLearn Academy'} • Class {student.class_name}{student.section_name ? ` — Section ${student.section_name}` : ''}{student.board_name ? ` • ${student.board_name}` : ''}
                  </p>
                </div>
              </div>
              <div className="relative z-10 grid grid-cols-2 gap-3">
                <div className="p-4 rounded-2xl flex items-center gap-3" style={{background:'rgba(255,255,255,0.15)'}}>
                  <Star className="text-yellow-200 shrink-0" size={20}/>
                  <div><p className="text-xs text-amber-200">Total XP</p><p className="font-black text-2xl">{student.xp}</p></div>
                </div>
                <div className="p-4 rounded-2xl flex items-center gap-3" style={{background:'rgba(255,255,255,0.15)'}}>
                  <Flame className="text-red-200 shrink-0" size={20}/>
                  <div><p className="text-xs text-amber-200">Streak</p><p className="font-black text-2xl">{student.streak} <span className="text-sm font-normal">days</span></p></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <Award className="mx-auto mb-3" size={48} color="#e2e8f0" />
              <p className="font-bold text-slate-700 mb-1">No student linked</p>
              <p className="text-sm text-slate-400">Contact the Admin to link your child's account.</p>
            </div>
          )}

          {/* Predictive Analytics Alert */}
          {riskAnalysis && riskAnalysis.risk_level !== 'low' && (
            <div className="card p-5 border-l-4" style={{borderLeftColor: riskAnalysis.risk_color}}>
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{background: riskAnalysis.risk_color + '20'}}>
                  <AlertTriangle size={20} style={{color: riskAnalysis.risk_color}} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-slate-800">{riskAnalysis.risk_label}</p>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{background: riskAnalysis.risk_color + '15', color: riskAnalysis.risk_color}}>Risk: {riskAnalysis.risk_score}%</span>
                  </div>
                  {riskAnalysis.risk_factors.map((f, i) => (
                    <div key={i} className="flex items-start gap-2 mt-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${f.severity === 'high' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                      <p className="text-xs text-slate-600"><span className="font-bold">{f.factor}:</span> {f.detail}</p>
                    </div>
                  ))}
                  {riskAnalysis.overall_accuracy !== null && (
                    <p className="text-xs text-slate-400 mt-2">Overall accuracy: {riskAnalysis.overall_accuracy}% • {riskAnalysis.missions_last_14_days} missions in last 14 days</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {riskAnalysis && riskAnalysis.risk_level === 'low' && (
            <div className="card p-4 flex items-center gap-3 border-l-4 border-l-emerald-400">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><span className="text-lg">🟢</span></div>
              <div>
                <p className="font-bold text-slate-800 text-sm">On Track</p>
                <p className="text-xs text-slate-500">{riskAnalysis.student_name || 'Your child'} is performing well! {riskAnalysis.overall_accuracy !== null ? `${riskAnalysis.overall_accuracy}% accuracy` : ''}</p>
              </div>
            </div>
          )}

          {/* History CTA */}
          {student && (
            <button onClick={loadHistory}
              className="w-full card p-5 flex justify-between items-center hover:bg-amber-50 hover:border-amber-200 transition-all group">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{background:'#fffbeb'}}>
                  <TrendingUp size={20} color="#d97706" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-slate-800">Mission History</p>
                  <p className="text-sm text-slate-500">View per-day scores &amp; answers</p>
                </div>
              </div>
              <ArrowRight size={18} className="text-slate-300 group-hover:text-amber-500 transition-colors" />
            </button>
          )}

          {/* Notifications */}
          <div className="card overflow-hidden">
            <button onClick={() => setShowNotif(!showNotif)}
              className="w-full p-5 flex justify-between items-center hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{background:'#fef3c7'}}>
                  <Bell size={20} color="#d97706" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">Notifications</h3>
                  <p className="text-sm text-slate-400">{notifications.length} alert{notifications.length!==1?'s':''}</p>
                </div>
              </div>
              {notifications.length > 0 && (
                <span className="badge" style={{background:'#fef2f2',color:'#dc2626'}}>{notifications.length}</span>
              )}
            </button>
            {showNotif && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {notifications.map((n, i) => (
                  <div key={i} className="flex gap-3 p-4">
                    <CheckCircle size={16} className="text-emerald-500 mt-0.5 shrink-0"/>
                    <div>
                      <p className="text-sm text-slate-700">{n.message}</p>
                      <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
                {notifications.length === 0 && <p className="text-sm text-slate-500 text-center py-4">No notifications yet.</p>}
              </div>
            )}
          </div>
        </div>
      )}


      {activeView === 'history' && (
        <div className="space-y-4 slide-up">
          <div className="section-header">
            <h1 className="section-title">📊 Mission History</h1>
          </div>

          {loadingHistory && (
            <div className="card p-8 text-center">
              <div className="loading-spinner mx-auto mb-3" />
              <p className="text-sm text-slate-400">Loading history...</p>
            </div>
          )}
          {!loadingHistory && history.length === 0 && (
            <div className="card p-8 text-center">
              <TrendingUp className="mx-auto mb-3" size={48} color="#e2e8f0" />
              <p className="font-semibold text-slate-500">No missions completed yet.</p>
            </div>
          )}
          {history.map((h, i) => (
            <div key={i} className="card overflow-hidden">
              <button onClick={() => toggleDay(h.date)}
                className="w-full text-left p-5 hover:bg-slate-50 transition-colors flex justify-between items-center">
                <div>
                  <p className="font-black text-slate-900">{h.date}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="badge badge-indigo">V:{h.vocab_score||0}</span>
                    <span className="badge badge-emerald">G:{h.grammar_score||0}</span>
                    <span className="badge badge-purple">S:{h.syllabus_score||0}</span>
                    <span className="badge" style={{background:'#faf5ff',color:'#6b21a8'}}>Sen:{h.sentence_score||0}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-emerald-600 font-black text-sm">{h.correct}✓</span>
                  <span className="text-red-500 font-black text-sm">{h.incorrect}✗</span>
                  {expandedDay === h.date ? <ChevronUp size={16} color="#6366f1"/> : <ChevronDown size={16} color="#94a3b8"/>}
                </div>
              </button>
              {expandedDay === h.date && (
                <div className="border-t border-slate-100 p-4" style={{background:'#f8fafc'}}>
                  {!dayAnswers[h.date] && <p className="text-xs text-slate-400 text-center py-2">Loading details...</p>}
                  {dayAnswers[h.date] && dayAnswers[h.date].length === 0 && <p className="text-xs text-slate-400 text-center py-2">No detailed data for this day.</p>}
                  {dayAnswers[h.date] && dayAnswers[h.date].map((a, j) => (
                    <div key={j} className={`flex items-start gap-3 p-3 rounded-xl mb-2 ${a.is_correct ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                      <span>{a.is_correct ? '✅' : '❌'}</span>
                      <div>
                        <p className="text-xs font-bold text-slate-500 capitalize">{a.section}</p>
                        <p className="text-sm text-slate-800">{a.question_text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeView === 'subjects' && (
        <div className="space-y-4 slide-up">
          <div className="section-header">
            <h1 className="section-title">📚 Subject Progress</h1>
          </div>
          {subjectProgress.length === 0 && (
            <div className="card p-8 text-center">
              <BookOpen className="mx-auto mb-3" size={48} color="#e2e8f0" />
              <p className="font-semibold text-slate-500">No subject progress data yet.</p>
              <p className="text-sm text-slate-400 mt-1">Subject quizzes need to be completed first.</p>
            </div>
          )}
          {Object.values(subjectProgress.reduce((acc, p) => {
            if (!acc[p.subject_id]) acc[p.subject_id] = { ...p, total_attempted: 0, total_correct: 0, xp_earned: 0 };
            acc[p.subject_id].total_attempted += p.total_attempted || 0;
            acc[p.subject_id].total_correct += p.total_correct || 0;
            acc[p.subject_id].xp_earned += p.xp_earned || 0;
            return acc;
          }, {})).map(p => {
            const accuracy = p.total_attempted > 0 ? Math.round((p.total_correct / p.total_attempted) * 100) : 0;
            return (
              <div key={p.subject_id} className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{p.icon}</span>
                  <div className="flex-1">
                    <p className="font-bold text-slate-800">{p.subject_name}</p>
                    <p className="text-xs text-slate-400">{p.code} • {p.total_attempted} questions attempted</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-indigo-600 text-sm">{p.xp_earned} XP</p>
                    <p className="text-xs text-slate-500">{accuracy}%</p>
                  </div>
                </div>
                <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{width: `${accuracy}%`, background: p.color || '#4f46e5'}}></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardLayout>
  );
}
