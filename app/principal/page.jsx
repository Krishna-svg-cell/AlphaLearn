'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Building2, Bell, Presentation, Users, Flame, Star, TrendingUp, ChevronDown, ChevronUp, Award, AlertTriangle, BookOpen, Plus, Trash2, X, Edit3, MessageCircle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

export default function PrincipalDashboard() {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [notifications, setNotifications] = useState([]);
  const [expandedClass, setExpandedClass] = useState(null);
  const [streakResult, setStreakResult] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayAnswers, setDayAnswers] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Subject management
  const [allSubjects, setAllSubjects] = useState([]);
  const [schoolSubjects, setSchoolSubjects] = useState([]);
  const [subjectClass, setSubjectClass] = useState('1');
  const [chapters, setChapters] = useState([]);
  const [selectedSubjectForChapters, setSelectedSubjectForChapters] = useState(null);
  const [chapterForm, setChapterForm] = useState({ chapter_number: 1, chapter_title: '', description: '', content: '' });
  const [showCustomSubjectModal, setShowCustomSubjectModal] = useState(false);
  const [customSubjectForm, setCustomSubjectForm] = useState({ name: '', code: '', icon: '📚', color: '#64748b', category: 'elective' });

  // Chapter quiz question management
  const [expandedChapterId, setExpandedChapterId] = useState(null);
  const [chapterQuestions, setChapterQuestions] = useState({});
  const [quizForm, setQuizForm] = useState({ question_text: '', options: ['', '', '', ''], correct_answer: '0', explanation: '', difficulty: 'medium' });
  const [editingChapter, setEditingChapter] = useState(null);
  const [editChapterForm, setEditChapterForm] = useState({});
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
        const [statsRes, usersRes] = await Promise.all([
          fetchWithRetry('/api/principal/stats', h),
          fetchWithRetry('/api/principal/users', h),
        ]);
        setStats(statsRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.clear(); router.push('/');
          return;
        }
        setError('Failed to load school data. Database connection may have dropped.');
        return;
      }

      // Non-critical
      axios.get('/api/notifications', { headers: h }).then(r => setNotifications(r.data)).catch(()=>{});
    };
    loadDashboard();
  }, [router]);

  // Group students by class
  const students = (users || []).filter(u => u.role === 'STUDENT');
  const staff = (users || []).filter(u => u.role === 'STAFF');
  const totalXP = students.reduce((a, s) => a + (s.xp || 0), 0);
  const avgStreak = students.length ? Math.round(students.reduce((a, s) => a + (s.streak || 0), 0) / students.length) : 0;

  const classesByName = {};
  students.forEach(s => {
    const key = s.class_name || 'Unassigned';
    if (!classesByName[key]) classesByName[key] = [];
    classesByName[key].push(s);
  });

  const topStudents = [...students].sort((a, b) => (b.xp || 0) - (a.xp || 0)).slice(0, 5);

  const tabs = [
    ['dashboard', 'Dashboard', Presentation],
    ['subjects', 'Subjects', BookOpen],
    ['classes', 'Class View', TrendingUp],
    ['staffview', 'Staff View', Users],
    ['staff', 'Roster', Users],
    ['notif', 'Notifications', Bell],
  ];

  // Subject helpers
  const fetchSubjects = async () => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    try {
      const [allRes, configRes] = await Promise.all([
        axios.get('/api/subjects', { headers: h }),
        axios.get('/api/principal/subjects', { headers: h }),
      ]);
      setAllSubjects(allRes.data);
      setSchoolSubjects(configRes.data);
    } catch(e) {}
  };
  const fetchChapters = async (subjectId, cls) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    try {
      const res = await axios.get(`/api/principal/chapters?subject_id=${subjectId}&class_name=${cls}`, { headers: h });
      setChapters(res.data);
      // Also fetch question counts per chapter
      const qRes = await axios.get(`/api/admin/subject-questions/counts?class_name=${cls}&school_id=${res.data[0]?.school_id || ''}`, { headers: h }).catch(() => ({ data: {} }));
      // Fetch questions for each chapter
      const qMap = {};
      for (const ch of res.data) {
        try {
          const qr = await axios.get(`/api/admin/subject-questions?subject_id=${subjectId}&class_name=${cls}&chapter_id=${ch.id}`, { headers: h });
          qMap[ch.id] = qr.data;
        } catch(e) { qMap[ch.id] = []; }
      }
      setChapterQuestions(qMap);
    } catch(e) { setChapters([]); setChapterQuestions({}); }
  };

  const addQuestionToChapter = async (chapterId) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    try {
      await axios.post('/api/admin/subject-questions', {
        subject_id: selectedSubjectForChapters.id,
        chapter_id: chapterId,
        class_name: subjectClass,
        question_text: quizForm.question_text,
        question_type: 'mcq',
        options: quizForm.options.filter(o => o.trim()),
        correct_answer: quizForm.correct_answer,
        explanation: quizForm.explanation,
        difficulty: quizForm.difficulty,
      }, { headers: h });
      setQuizForm({ question_text: '', options: ['', '', '', ''], correct_answer: '0', explanation: '', difficulty: 'medium' });
      fetchChapters(selectedSubjectForChapters.id, subjectClass);
    } catch (err) { alert(err.response?.data?.error || 'Failed to add question'); }
  };

  const deleteQuestion = async (questionId) => {
    if (!confirm('Delete this question?')) return;
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    try {
      await axios.delete(`/api/admin/subject-questions/${questionId}`, { headers: h });
      fetchChapters(selectedSubjectForChapters.id, subjectClass);
    } catch (err) { alert('Failed to delete'); }
  };

  const updateChapter = async (chapterId) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    try {
      await axios.put(`/api/principal/chapters/${chapterId}`, editChapterForm, { headers: h });
      setEditingChapter(null);
      fetchChapters(selectedSubjectForChapters.id, subjectClass);
    } catch (err) { alert('Failed to update chapter'); }
  };
  useEffect(() => { if(activeTab === 'subjects') fetchSubjects(); }, [activeTab]);

  const openStudentHistory = async (student) => {
    setSelectedStudent(student); setLoadingHistory(true); setStudentHistory([]); setExpandedDay(null); setDayAnswers({});
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get(`/api/staff/student/${student.id}/history`, { headers: h });
      setStudentHistory(res.data);
    } catch(e) {}
    setLoadingHistory(false);
  };
  const toggleDay = async (date) => {
    if (expandedDay === date) { setExpandedDay(null); return; }
    setExpandedDay(date);
    if (!dayAnswers[date]) {
      try {
        const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
        const res = await axios.get(`/api/staff/student/${selectedStudent.id}/history/${date}`, { headers: h });
        setDayAnswers(prev => ({ ...prev, [date]: res.data }));
      } catch(e) {}
    }
  };

  if (error) {
    return (
      <DashboardLayout subtitle="Principal Panel" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} roleColor="emerald">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <p className="font-bold text-lg text-slate-800">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  if (!stats || !users) {
    return (
      <DashboardLayout subtitle="Principal Panel" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} roleColor="emerald">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
          <p className="font-bold text-lg">Loading school data...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout subtitle="Principal Panel" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} roleColor="emerald">

        {/* ---- DASHBOARD TAB ---- */}
        {activeTab === 'dashboard' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">School Overview</h2>

          {/* Stats row */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><Users size={20}/></div>
              <div><p className="text-xs text-slate-500">Staff</p><p className="text-xl font-bold text-slate-800">{stats.total_staff}</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl"><Presentation size={20}/></div>
              <div><p className="text-xs text-slate-500">Students</p><p className="text-xl font-bold text-slate-800">{stats.total_students}</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-yellow-100 text-yellow-600 rounded-xl"><Star size={20}/></div>
              <div><p className="text-xs text-slate-500">Total XP</p><p className="text-xl font-bold text-slate-800">{totalXP}</p></div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center">
              <div className="p-3 bg-orange-100 text-orange-600 rounded-xl"><Flame size={20}/></div>
              <div><p className="text-xs text-slate-500">Avg. Streak</p><p className="text-xl font-bold text-slate-800">{avgStreak}</p></div>
            </div>
          </div>

          {/* Top Students & Classes summary */}
          <div className="grid grid-cols-1 gap-6">
            {/* Top Students */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <Award className="text-yellow-500" size={20}/>
                <h3 className="font-bold text-slate-800">Top Students</h3>
              </div>
              {topStudents.length === 0 && <p className="text-slate-400 text-sm">No student data yet.</p>}
              {topStudents.map((s, i) => (
                <div key={s.id} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`font-bold w-6 text-sm ${i < 3 ? 'text-yellow-500' : 'text-slate-400'}`}>{i + 1}</span>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{s.username}</p>
                      <p className="text-xs text-slate-400">Class {s.class_name||'?'}{s.section_name?`-${s.section_name}`:''}{s.board_name?` • ${s.board_name}`:''}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-indigo-600 text-sm">{s.xp} XP</p>
                    <p className="text-xs text-orange-500">{s.streak}🔥</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Classes snapshot */}
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="text-emerald-500" size={20}/>
                <h3 className="font-bold text-slate-800">Class Breakdown</h3>
              </div>
              {Object.keys(classesByName).length === 0 && <p className="text-slate-400 text-sm">No class data yet.</p>}
              {Object.entries(classesByName).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([cls, studs]) => {
                const avgXP = Math.round(studs.reduce((a,s)=>a+(s.xp||0),0)/studs.length);
                return (
                  <div key={cls} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">Class {cls}</p>
                      <p className="text-xs text-slate-400">{studs.length} students</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-600 text-sm">{avgXP} avg XP</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>)}

        {/* ---- STAFF VIEW TAB ---- */}
        {activeTab === 'staffview' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Staff-wise View</h2>
          {/* Streak Check */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 mb-6 flex flex-col items-center gap-4 text-center">
            <div><h3 className="font-bold text-slate-800">Streak Monitor</h3><p className="text-sm text-slate-500">Scan students who missed today's mission and notify parents.</p></div>
            <button onClick={async()=>{try{const h={Authorization:`Bearer ${localStorage.getItem('token')}`};const r=await axios.post('/api/principal/check-streaks',{},{headers:h});setStreakResult(r.data);}catch(e){alert('Error');}}} className="bg-gradient-to-r from-orange-600 to-red-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:shadow-lg transition-all flex items-center gap-2"><AlertTriangle size={16}/> Check Streaks</button>
          </div>
          {streakResult && <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 mb-6 text-sm text-orange-800"><strong>{streakResult.message}</strong></div>}
          {staff.length === 0 && <div className="bg-white rounded-3xl p-8 text-center text-slate-500">No staff members assigned to this school yet.</div>}
          {staff.map(stf => {
            const staffStudents = students.filter(s => s.class_name === stf.class_name && (!stf.section_name || s.section_name === stf.section_name));
            const avgXP = staffStudents.length ? Math.round(staffStudents.reduce((a,s)=>a+(s.xp||0),0)/staffStudents.length) : 0;
            return (
              <div key={stf.id} className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-4">
                <div className="flex justify-between items-center mb-4">
                  <div><h3 className="font-bold text-slate-800">{stf.username}</h3><p className="text-sm text-slate-500">Class {stf.class_name||'?'}{stf.section_name?` - Section ${stf.section_name}`:''}{stf.board_name ? ` • ${stf.board_name}` : ''}</p></div>
                  <div className="text-right"><p className="text-sm font-bold text-indigo-600">{staffStudents.length} students</p><p className="text-xs text-slate-500">Avg {avgXP} XP</p></div>
                </div>
                {staffStudents.length > 0 ? (
                  <table className="w-full text-sm"><thead><tr className="border-b text-slate-500"><th className="pb-2 text-left">Student</th><th className="pb-2">USN</th><th className="pb-2">XP</th><th className="pb-2">Streak</th></tr></thead>
                    <tbody>{staffStudents.sort((a,b)=>(b.xp||0)-(a.xp||0)).map(s=>(<tr key={s.id} className="border-b border-slate-50"><td className="py-2 font-medium">{s.username}</td><td className="py-2 text-slate-500">{s.usn||'-'}</td><td className="py-2 font-bold text-indigo-600">{s.xp||0}</td><td className="py-2 text-orange-500">{s.streak||0}🔥</td></tr>))}</tbody>
                  </table>
                ) : <p className="text-slate-400 text-sm">No students mapped to this staff member.</p>}
              </div>
            );
          })}
        </>)}

        {/* ---- CLASS VIEW TAB ---- */}
        {activeTab === 'classes' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Class-wise View</h2>
          <div className="space-y-4">
            {Object.keys(classesByName).length === 0 && (
              <div className="bg-white rounded-3xl p-8 text-center text-slate-500">No student data yet.</div>
            )}
            {Object.entries(classesByName).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([cls, studs]) => {
              const isExpanded = expandedClass === cls;
              const avgXP = Math.round(studs.reduce((a,s)=>a+(s.xp||0),0)/studs.length);
              const topInClass = [...studs].sort((a,b)=>(b.xp||0)-(a.xp||0))[0];
              return (
                <div key={cls} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                  <button onClick={() => setExpandedClass(isExpanded ? null : cls)} className="w-full flex justify-between items-center p-6 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-bold text-lg">{cls}</div>
                      <div className="text-left">
                        <p className="font-bold text-slate-800">Class {cls}</p>
                        <p className="text-sm text-slate-500">{studs.length} students • Avg {avgXP} XP</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {topInClass && <div className="text-right text-sm"><p className="text-slate-500">Top: <span className="font-bold text-slate-800">{topInClass.username}</span></p><p className="text-indigo-600 font-bold">{topInClass.xp} XP</p></div>}
                      {isExpanded ? <ChevronUp size={18} className="text-emerald-600"/> : <ChevronDown size={18} className="text-slate-400"/>}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-100 p-6 bg-slate-50">
                      <table className="w-full text-left text-sm">
                        <thead><tr className="text-slate-500 border-b border-slate-200"><th className="pb-2">Student</th><th className="pb-2">Section</th><th className="pb-2">USN</th><th className="pb-2">XP</th><th className="pb-2">Streak</th><th className="pb-2"></th></tr></thead>
                        <tbody>
                          {studs.sort((a,b)=>(b.xp||0)-(a.xp||0)).map(s => (
                            <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-100 cursor-pointer" onClick={()=>openStudentHistory(s)}>
                              <td className="py-3 font-semibold text-slate-800">{s.username}</td>
                              <td className="py-3 text-slate-600">{s.section_name||'-'}</td>
                              <td className="py-3 text-slate-500">{s.usn||'-'}</td>
                              <td className="py-3 font-bold text-indigo-600">{s.xp||0}</td>
                              <td className="py-3 text-orange-500 font-medium">{s.streak||0}🔥</td>
                              <td className="py-3 text-indigo-400 text-xs">View →</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>)}

        {/* ---- STAFF & STUDENTS TAB ---- */}
        {activeTab === 'staff' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Staff & Student Roster</h2>

          {/* Staff section */}
          {staff.length > 0 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
              <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Users size={18} className="text-indigo-500"/> Staff Members ({staff.length})</h3>
              <table className="w-full text-left">
                <thead><tr className="border-b border-slate-200 text-slate-500 text-sm"><th className="pb-3">Name</th><th className="pb-3">Class</th><th className="pb-3">Section</th></tr></thead>
                <tbody className="text-xs">
                  {staff.map(u => (
                    <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 pr-2 font-semibold text-slate-800">{u.username}</td>
                      <td className="py-3 pr-2 text-slate-600">{u.class_name||'-'}</td>
                      <td className="py-3 pr-2 text-slate-600">{u.section_name||'-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Students section */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Presentation size={18} className="text-emerald-500"/> All Students ({students.length})</h3>
            <table className="w-full text-left">
              <thead><tr className="border-b border-slate-200 text-slate-500 text-sm"><th className="pb-3">Name</th><th className="pb-3">Class/Section</th><th className="pb-3">XP</th><th className="pb-3">Streak</th></tr></thead>
              <tbody className="text-xs">
                {students.map(u => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 pr-2 font-semibold text-slate-800">{u.username}</td>
                    <td className="py-3 pr-2 text-slate-600">{u.class_name||'-'}{u.section_name?`-${u.section_name}`:''}</td>
                    <td className="py-3 pr-2 font-bold text-indigo-600">{u.xp||0}</td>
                    <td className="py-3 pr-2 text-orange-500 font-medium">{u.streak||0}🔥</td>
                  </tr>
                ))}
                {students.length === 0 && <tr><td colSpan="4" className="py-8 text-center text-slate-500">No students found.</td></tr>}
              </tbody>
            </table>
          </div>
        </>)}

        {/* ---- NOTIFICATIONS TAB ---- */}
        {activeTab === 'notif' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Notifications</h2>
          {/* Send form */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-6">
            <h3 className="font-bold text-slate-700 mb-4">Send Notification to School</h3>
            <form onSubmit={async(e)=>{e.preventDefault();const msg=e.target.msg.value;const role=e.target.role.value;try{const h={Authorization:`Bearer ${localStorage.getItem('token')}`};await axios.post('/api/notifications',{message:msg,target_role:role||null},{headers:h});alert('Sent!');e.target.reset();const r2=await axios.get('/api/notifications',{headers:h});setNotifications(r2.data);}catch(err){alert('Error');}}} className="space-y-4 max-w-xl">
              <div><label className="block text-sm font-medium mb-1">Message</label><textarea required name="msg" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none" rows={2} placeholder="Type your message here..."/></div>
              <div><label className="block text-sm font-medium mb-1">Target Role</label><select name="role" className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"><option value="">Everyone in School</option><option value="STUDENT">Students</option><option value="STAFF">Staff</option><option value="PARENT">Parents</option></select></div>
              <button type="submit" className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all">Send Notification</button>
            </form>
          </div>
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h4 className="font-bold text-slate-700 mb-4">Recent Notifications</h4>
            {notifications.map((n, i) => (
              <div key={i} className="p-4 border-b border-slate-100 last:border-0">
                <p className="text-slate-700">{n.message}</p>
                <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
            {notifications.length === 0 && <p className="text-slate-500 text-center py-6">No notifications yet.</p>}
          </div>
        </>)}

        {/* ---- SUBJECTS TAB ---- */}
        {activeTab === 'subjects' && (<>
          <h2 className="text-2xl font-bold text-slate-800 mb-6">Subject Management</h2>

          {/* Class selector */}
          <div className="flex items-center gap-3 mb-6 flex-wrap">
            <span className="text-sm font-bold text-slate-600">Class:</span>
            {Array.from({length:12},(_,i)=>i+1).map(c => (
              <button key={c} onClick={() => setSubjectClass(String(c))} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${subjectClass === String(c) ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{c}</button>
            ))}
            <button onClick={() => setShowCustomSubjectModal(true)} className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-sm hover:shadow-lg transition-all"><Plus size={14}/> Custom Subject</button>
          </div>

          {/* Subject grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {allSubjects.map(sub => {
              const config = schoolSubjects.find(ss => ss.subject_id === sub.id && ss.class_name === subjectClass);
              const isEnabled = !!config;
              return (
                <div key={sub.id} className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${isEnabled ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white opacity-60 hover:opacity-100'}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-2xl">{sub.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800 truncate">{sub.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{sub.code} • {sub.category}</p>
                    </div>
                  </div>
                  {isEnabled && config.teacher_name && <p className="text-xs text-emerald-700 mb-2">👩‍🏫 {config.teacher_name}</p>}
                  <div className="flex gap-2">
                    {!isEnabled ? (
                      <button onClick={async () => { const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; await axios.post('/api/principal/subjects', { subject_id: sub.id, class_name: subjectClass }, { headers: h }); fetchSubjects(); }} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">Enable</button>
                    ) : (
                      <>
                        <button onClick={async () => { const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; await axios.delete(`/api/principal/subjects/${config.id}`, { headers: h }); fetchSubjects(); }} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors">Disable</button>
                        <button onClick={() => { setSelectedSubjectForChapters(sub); setChapterForm({ chapter_number: 1, chapter_title: '', description: '' }); fetchChapters(sub.id, subjectClass); }} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition-colors">Chapters</button>
                      </>
                    )}
                  </div>
                  {/* Teacher assignment */}
                  {isEnabled && (
                    <select value={config.assigned_teacher_id || ''} onChange={async (e) => { const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; await axios.put(`/api/principal/subjects/${config.id}`, { ...config, assigned_teacher_id: e.target.value || null }, { headers: h }); fetchSubjects(); }} className="w-full mt-2 text-xs border border-slate-200 rounded-lg p-1.5 bg-white">
                      <option value="">Assign Teacher...</option>
                      {staff.map(s => <option key={s.id} value={s.id}>{s.username}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>

          {/* Chapter Manager */}
          {selectedSubjectForChapters && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800 text-lg">{selectedSubjectForChapters.icon} {selectedSubjectForChapters.name} — Class {subjectClass} Chapters</h3>
                <button onClick={() => { setSelectedSubjectForChapters(null); setExpandedChapterId(null); }} className="text-slate-400 hover:text-slate-600"><X size={18}/></button>
              </div>
              {/* Add chapter form */}
              <form onSubmit={async(e)=>{ e.preventDefault(); const h={Authorization:`Bearer ${localStorage.getItem('token')}`}; try { await axios.post('/api/principal/chapters', { subject_id: selectedSubjectForChapters.id, class_name: subjectClass, ...chapterForm, chapter_number: chapterForm.chapter_number || 1 }, { headers: h }); setChapterForm({ chapter_number: (chapterForm.chapter_number || 1) + 1, chapter_title: '', description: '', content: '' }); fetchChapters(selectedSubjectForChapters.id, subjectClass); } catch(err) { alert(err.response?.data?.error || 'Failed to add chapter'); }}} className="flex flex-col gap-3 mb-6 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 rounded-2xl border border-emerald-100">
                <p className="text-sm font-bold text-emerald-700 flex items-center gap-2"><Plus size={14}/> Add New Chapter</p>
                <div className="flex gap-2">
                  <input type="number" min="1" value={chapterForm.chapter_number || ''} onChange={e => setChapterForm({...chapterForm, chapter_number: e.target.value === '' ? '' : parseInt(e.target.value) || 1})} onFocus={e => e.target.select()} className="w-16 border border-slate-200 rounded-lg p-2 text-sm text-center bg-white" placeholder="#" title="Chapter Number" />
                  <input required value={chapterForm.chapter_title} onChange={e => setChapterForm({...chapterForm, chapter_title: e.target.value})} className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white" placeholder="Chapter Title (e.g. Parts of a Plant)" />
                </div>
                <input value={chapterForm.description} onChange={e => setChapterForm({...chapterForm, description: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white" placeholder="Short Summary (optional)" />
                <textarea value={chapterForm.content} onChange={e => setChapterForm({...chapterForm, content: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm min-h-[80px] bg-white" placeholder="Lesson Content / Study Material (This is what students will read...)" />
                <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-2"><Plus size={16}/> Add Chapter</button>
              </form>

              {/* Chapter list */}
              {chapters.length === 0 && <p className="text-slate-400 text-sm text-center py-4">No chapters yet. Add one above.</p>}
              <div className="space-y-3">
              {chapters.map(ch => {
                const isExpanded = expandedChapterId === ch.id;
                const qCount = (chapterQuestions[ch.id] || []).length;
                const isEditing = editingChapter === ch.id;
                return (
                <div key={ch.id} className="rounded-2xl border border-slate-200 overflow-hidden">
                  {/* Chapter Header */}
                  <div className="flex items-center p-4 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer" onClick={() => { setExpandedChapterId(isExpanded ? null : ch.id); }}>
                    <span className="w-10 h-10 bg-indigo-100 text-indigo-700 rounded-xl flex items-center justify-center font-bold text-sm mr-3 flex-shrink-0">{ch.chapter_number}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-slate-800">{ch.chapter_title}</p>
                      {ch.description && <p className="text-xs text-slate-500 truncate">{ch.description}</p>}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {ch.content && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">✓ Lesson Material</span>}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${qCount > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>{qCount} question{qCount !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      <button onClick={(e) => { e.stopPropagation(); setEditingChapter(isEditing ? null : ch.id); setEditChapterForm({ chapter_title: ch.chapter_title, description: ch.description || '', content: ch.content || '', chapter_number: ch.chapter_number }); }} className="text-slate-400 hover:text-indigo-600 p-1" title="Edit Chapter"><Edit3 size={14}/></button>
                      <button onClick={async (e) => { e.stopPropagation(); if (!confirm(`Delete chapter "${ch.chapter_title}"? This will also remove all questions in this chapter.`)) return; const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; await axios.delete(`/api/principal/chapters/${ch.id}`, { headers: h }); fetchChapters(selectedSubjectForChapters.id, subjectClass); }} className="text-slate-400 hover:text-red-600 p-1" title="Delete Chapter"><Trash2 size={14}/></button>
                      {isExpanded ? <ChevronUp size={16} className="text-emerald-600"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </div>

                  {/* Edit Chapter Form */}
                  {isEditing && (
                    <div className="p-4 bg-yellow-50 border-t border-yellow-100">
                      <p className="text-sm font-bold text-yellow-700 mb-3">✏️ Edit Chapter</p>
                      <div className="flex gap-2 mb-2">
                        <input type="number" min="1" value={editChapterForm.chapter_number || ''} onChange={e => setEditChapterForm({...editChapterForm, chapter_number: parseInt(e.target.value) || 1})} className="w-16 border border-slate-200 rounded-lg p-2 text-sm text-center bg-white" />
                        <input value={editChapterForm.chapter_title || ''} onChange={e => setEditChapterForm({...editChapterForm, chapter_title: e.target.value})} className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white" placeholder="Chapter Title" />
                      </div>
                      <input value={editChapterForm.description || ''} onChange={e => setEditChapterForm({...editChapterForm, description: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white mb-2" placeholder="Summary" />
                      <textarea value={editChapterForm.content || ''} onChange={e => setEditChapterForm({...editChapterForm, content: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 text-sm bg-white min-h-[60px] mb-2" placeholder="Lesson Content" />
                      <div className="flex gap-2">
                        <button onClick={() => updateChapter(ch.id)} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold text-sm">Save Changes</button>
                        <button onClick={() => setEditingChapter(null)} className="py-2 px-4 bg-slate-200 text-slate-700 rounded-lg font-bold text-sm">Cancel</button>
                      </div>
                    </div>
                  )}

                  {/* Expanded: Questions List + Add Question Form */}
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-4 bg-white">
                      {/* Existing Questions */}
                      {(chapterQuestions[ch.id] || []).length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Questions in this Chapter</p>
                          <div className="space-y-2">
                          {(chapterQuestions[ch.id] || []).map((q, qi) => (
                            <div key={q.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                              <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">{qi + 1}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-800 font-medium">{q.question_text}</p>
                                {q.options_json && (() => {
                                  try {
                                    const opts = typeof q.options_json === 'string' ? JSON.parse(q.options_json) : q.options_json;
                                    return (
                                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                                        {opts.map((opt, oi) => (
                                          <span key={oi} className={`text-[11px] px-2 py-0.5 rounded-lg ${String(oi) === String(q.correct_answer) ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-500'}`}>
                                            {String.fromCharCode(65 + oi)}. {opt}
                                          </span>
                                        ))}
                                      </div>
                                    );
                                  } catch(e) { return null; }
                                })()}
                                {q.explanation && <p className="text-[10px] text-slate-400 mt-1">💡 {q.explanation}</p>}
                                <span className={`text-[10px] mt-1 inline-block px-1.5 py-0.5 rounded font-bold ${q.difficulty === 'easy' ? 'bg-green-100 text-green-700' : q.difficulty === 'hard' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>{q.difficulty}</span>
                              </div>
                              <button onClick={() => deleteQuestion(q.id)} className="text-slate-300 hover:text-red-500 mt-0.5 flex-shrink-0"><Trash2 size={13}/></button>
                            </div>
                          ))}
                          </div>
                        </div>
                      )}

                      {/* Add Question Form */}
                      <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                        <p className="text-sm font-bold text-indigo-700 mb-3 flex items-center gap-2"><MessageCircle size={14}/> Add Quiz Question</p>
                        <textarea value={quizForm.question_text} onChange={e => setQuizForm({...quizForm, question_text: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white mb-2" placeholder="Type question here..." rows={2} />
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {quizForm.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-1">
                              <input type="radio" name={`correct-${ch.id}`} checked={quizForm.correct_answer === String(oi)} onChange={() => setQuizForm({...quizForm, correct_answer: String(oi)})} className="accent-emerald-600" />
                              <input value={opt} onChange={e => { const newOpts = [...quizForm.options]; newOpts[oi] = e.target.value; setQuizForm({...quizForm, options: newOpts}); }} className={`flex-1 border rounded-lg p-2 text-sm bg-white ${quizForm.correct_answer === String(oi) ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200'}`} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-slate-400 mb-2">● Select the radio button next to the correct answer</p>
                        <div className="flex gap-2 mb-3">
                          <input value={quizForm.explanation} onChange={e => setQuizForm({...quizForm, explanation: e.target.value})} className="flex-1 border border-slate-200 rounded-lg p-2 text-sm bg-white" placeholder="Explanation (optional)" />
                          <select value={quizForm.difficulty} onChange={e => setQuizForm({...quizForm, difficulty: e.target.value})} className="border border-slate-200 rounded-lg p-2 text-sm bg-white w-24">
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                        <button type="button" disabled={!quizForm.question_text.trim() || quizForm.options.filter(o => o.trim()).length < 2} onClick={() => addQuestionToChapter(ch.id)} className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                          <Plus size={14}/> Add Question to Ch. {ch.chapter_number}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
              </div>
            </div>
          )}
        </>)}

      {/* Custom Subject Modal */}
      {showCustomSubjectModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex justify-between items-center mb-4"><h3 className="text-lg font-bold">Add Custom Subject</h3><button onClick={() => setShowCustomSubjectModal(false)}><X size={20}/></button></div>
            <form onSubmit={async(e)=>{ e.preventDefault(); const h={Authorization:`Bearer ${localStorage.getItem('token')}`}; try { await axios.post('/api/principal/subjects/custom', customSubjectForm, { headers: h }); setShowCustomSubjectModal(false); setCustomSubjectForm({ name:'', code:'', icon:'📚', color:'#64748b', category:'elective' }); fetchSubjects(); } catch(err) { alert(err.response?.data?.error||'Error'); }}} className="space-y-3">
              <div><label className="block text-sm font-medium mb-1">Subject Name</label><input required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={customSubjectForm.name} onChange={e=>setCustomSubjectForm({...customSubjectForm, name:e.target.value})} placeholder="e.g. Sanskrit" /></div>
              <div><label className="block text-sm font-medium mb-1">Code (unique)</label><input required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm uppercase" value={customSubjectForm.code} onChange={e=>setCustomSubjectForm({...customSubjectForm, code:e.target.value})} placeholder="e.g. SAN" /></div>
              <div className="flex gap-3">
                <div className="flex-1"><label className="block text-sm font-medium mb-1">Icon (emoji)</label><input className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={customSubjectForm.icon} onChange={e=>setCustomSubjectForm({...customSubjectForm, icon:e.target.value})} /></div>
                <div className="flex-1"><label className="block text-sm font-medium mb-1">Color</label><input type="color" className="w-full h-10 border border-slate-200 rounded-lg" value={customSubjectForm.color} onChange={e=>setCustomSubjectForm({...customSubjectForm, color:e.target.value})} /></div>
              </div>
              <div><label className="block text-sm font-medium mb-1">Category</label><select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={customSubjectForm.category} onChange={e=>setCustomSubjectForm({...customSubjectForm, category:e.target.value})}><option value="core">Core</option><option value="language">Language</option><option value="elective">Elective</option></select></div>
              <button type="submit" className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-2.5 rounded-xl font-bold text-sm hover:shadow-lg transition-all">Create Subject</button>
            </form>
          </div>
        </div>
      )}

      {/* Student History Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-t-3xl p-6 text-white">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center font-bold text-2xl">{selectedStudent.username[0].toUpperCase()}</div>
                  <div><h2 className="font-bold text-xl">{selectedStudent.username}</h2><p className="text-emerald-200 text-sm">Class {selectedStudent.class_name||'N/A'}{selectedStudent.section_name?` - ${selectedStudent.section_name}`:''}{selectedStudent.board_name ? ` • ${selectedStudent.board_name}` : ''}</p><p className="text-emerald-300 text-xs">USN: {selectedStudent.usn||'-'}</p></div>
                </div>
                <button onClick={()=>setSelectedStudent(null)} className="text-white/70 hover:text-white text-xl font-bold">✕</button>
              </div>
              <div className="flex gap-3 mt-4">
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10"><Star className="mx-auto mb-1 text-yellow-300" size={16}/><p className="text-xs opacity-75">XP</p><p className="font-bold text-lg">{selectedStudent.xp||0}</p></div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10"><Flame className="mx-auto mb-1 text-orange-300" size={16}/><p className="text-xs opacity-75">Streak</p><p className="font-bold text-lg">{selectedStudent.streak||0} days</p></div>
                <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10"><TrendingUp className="mx-auto mb-1 text-emerald-300" size={16}/><p className="text-xs opacity-75">Missions</p><p className="font-bold text-lg">{studentHistory.length}</p></div>
              </div>
            </div>
            <div className="p-6">
              <h3 className="font-bold text-slate-800 mb-4">Mission History</h3>
              {loadingHistory && <p className="text-center text-slate-500 py-4">Loading history...</p>}
              {!loadingHistory && studentHistory.length === 0 && <p className="text-center text-slate-500 py-6 text-sm">No missions completed yet.</p>}
              {studentHistory.map((h, i) => (
                <div key={i} className="mb-3 border border-slate-100 rounded-2xl overflow-hidden">
                  <button onClick={() => toggleDay(h.date)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
                    <div><p className="font-bold text-slate-800 text-sm">{h.date}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-xs text-slate-500">V:{h.vocab_score||0}</span>
                        <span className="text-xs text-slate-500">G:{h.grammar_score||0}</span>
                        <span className="text-xs text-slate-500">S:{h.syllabus_score||0}</span>
                        <span className="text-xs text-slate-500">St:{h.sentence_score||0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right"><span className="text-emerald-600 font-bold text-sm">{h.correct}✓</span><span className="text-red-500 font-bold text-sm ml-2">{h.incorrect}✗</span></div>
                      {expandedDay === h.date ? <ChevronUp size={16} className="text-emerald-600"/> : <ChevronDown size={16} className="text-slate-400"/>}
                    </div>
                  </button>
                  {expandedDay === h.date && (
                    <div className="border-t border-slate-100 p-4 bg-slate-50">
                      {!dayAnswers[h.date] && <p className="text-center text-slate-400 text-xs py-2">Loading details...</p>}
                      {dayAnswers[h.date] && dayAnswers[h.date].length === 0 && <p className="text-center text-slate-400 text-xs py-2">No detailed data.</p>}
                      {dayAnswers[h.date] && dayAnswers[h.date].map((a, j) => (
                        <div key={j} className={`flex items-start gap-3 p-3 rounded-xl mb-2 ${a.is_correct ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                          <span className="text-lg">{a.is_correct ? '✅' : '❌'}</span>
                          <div className="flex-1"><p className="text-xs font-bold text-slate-600 capitalize mb-0.5">{a.section}</p><p className="text-sm text-slate-800">{a.question_text}</p>
                            {!a.is_correct && <p className="text-xs text-red-600 mt-1">Selected: {a.selected_index} | Correct: {a.correct_index}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
