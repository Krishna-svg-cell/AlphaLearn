'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Users, BarChart2, Send, CheckCircle, ArrowLeft, Bell, Download, ChevronDown, ChevronUp, X, Flame, Star, MessageSquare, Calendar, MessageCircle, BookOpen } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

export default function StaffDashboard() {
  const [students, setStudents] = useState(null);
  const [error, setError] = useState(null);
  const [activeView, setActiveView] = useState('students');
  const [notifications, setNotifications] = useState([]);
  // Student detail / history
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [expandedDay, setExpandedDay] = useState(null);
  const [dayAnswers, setDayAnswers] = useState({});
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [notifRole, setNotifRole] = useState('');
  
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [studentSubjectProgress, setStudentSubjectProgress] = useState([]);
  
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
        const res = await fetchWithRetry('/api/staff/students', h);
        setStudents(res.data);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.clear(); router.push('/');
          return;
        }
        setError('Failed to load students. Database connection may have dropped.');
        return;
      }

      // Non-critical
      axios.get('/api/notifications', { headers: h }).then(r => setNotifications(r.data)).catch(()=>{});
    };
    loadDashboard();
  }, [router]);

  useEffect(() => {
      if (activeView === 'messages' && selectedStudent) {
          const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
          axios.get(`/api/communication/messages?student_id=${selectedStudent.id}`, { headers: h })
          .then(res => {
              setMessages(res.data);
              // Mark as read
              axios.put('/api/communication/messages/read', { sender_id: selectedStudent.id }, { headers: h }).catch(()=>{});
          }).catch(()=>{});
      }
  }, [activeView, selectedStudent]);

  const openStudentHistory = async (student) => {
    setSelectedStudent(student);
    setLoadingHistory(true);
    setStudentHistory([]);
    setExpandedDay(null);
    setDayAnswers({});
    setActiveView('history');
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get(`/api/staff/student/${student.id}/history`, { headers: h });
      setStudentHistory(res.data);
      // Fetch subject progress too
      axios.get(`/api/staff/student/${student.id}/subject-progress`, { headers: h }).then(r => setStudentSubjectProgress(r.data)).catch(() => setStudentSubjectProgress([]));
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


  const sendMessage = async (e) => {
      e.preventDefault();
      if (!newMessage.trim() || !selectedStudent) return;
      try {
          const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
          await axios.post('/api/communication/messages', { receiver_id: selectedStudent.id, message: newMessage }, { headers: h });
          setMessages(prev => [...prev, { sender_id: null /* current user */, message: newMessage, created_at: new Date().toISOString() }]);
          setNewMessage('');
      } catch(e) { alert('Failed to send message'); }
  };

  const downloadPDF = async () => {
    try {
        const { jsPDF } = await import('jspdf');
        const autoTable = (await import('jspdf-autotable')).default;
        const doc = new jsPDF();
        
        doc.setFontSize(18);
        doc.text('Class Performance Report', 14, 22);
        doc.setFontSize(11);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
        
        const tableData = students.map(s => [s.username, s.usn || '-', s.class_name || '-', s.section_name || '-', s.xp, s.streak]);
        
        autoTable(doc, {
            startY: 40,
            head: [['Name', 'USN', 'Class', 'Section', 'XP', 'Streak']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }
        });
        
        doc.save('Class_Report.pdf');
    } catch(err) {
        alert('Please run `npm install jspdf jspdf-autotable` to enable PDF downloads.');
    }
  };

  const ScoreBadge = ({ label, value, color }) => (
    <div className={`flex-1 text-center p-2 rounded-xl ${color}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="font-bold text-lg">{value}</p>
    </div>
  );

  const tabs = [
    ['students', 'Students', Users],
    ['messages', 'Messages', MessageCircle],
    ['reports', 'Reports', Send],
    ['sendnotif', 'Alert', MessageSquare]
  ];

  if (error) {
    return (
      <DashboardLayout subtitle="Staff Dashboard" tabs={tabs} activeTab={activeView === 'history' ? 'students' : activeView} onTabChange={(t) => { setActiveView(t); setSelectedStudent(null); setStudentHistory([]); }} roleColor="indigo">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <p className="font-bold text-lg text-red-500 mb-2">Error</p>
          <p className="font-bold text-lg text-slate-800">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  if (!students) {
    return (
      <DashboardLayout subtitle="Staff Dashboard" tabs={tabs} activeTab={activeView === 'history' ? 'students' : activeView} onTabChange={(t) => { setActiveView(t); setSelectedStudent(null); setStudentHistory([]); }} roleColor="indigo">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="font-bold text-lg">Loading assigned students...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout subtitle="Staff Dashboard" tabs={tabs} activeTab={activeView === 'history' ? 'students' : activeView} onTabChange={(t) => { setActiveView(t); setSelectedStudent(null); setStudentHistory([]); }} roleColor="indigo">

      {activeView === 'history' && (
        <button onClick={() => { setActiveView('students'); setSelectedStudent(null); setStudentHistory([]); }} className="flex items-center gap-2 text-indigo-600 font-bold mb-6 hover:underline"><ArrowLeft size={20}/> Back to Students</button>
      )}

      {(activeView === 'students' || activeView === 'progress') && (() => {
        const sections = {};
        students.forEach(s => { const sec = s.section_name || 'Unassigned'; if(!sections[sec]) sections[sec]=[]; sections[sec].push(s); });
        return (
        <div className="space-y-6">
          {/* Quick stats moved from home */}
          {students.length > 0 && activeView === 'students' && (
            <div className="relative overflow-hidden rounded-[24px] p-6 text-white mb-6 shadow-xl" style={{background:'linear-gradient(135deg,#312e81,#4c1d95)'}}>
              <div className="absolute top-[-30px] right-[-30px] w-[100px] h-[100px] rounded-full opacity-20" style={{background:'white'}} />
              <h3 className="font-black mb-4 text-lg">Class Overview</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl p-3 text-center" style={{background:'rgba(255,255,255,0.12)'}}>
                  <p className="text-2xl font-black">{students.length}</p>
                  <p className="text-xs opacity-75">Students</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{background:'rgba(255,255,255,0.12)'}}>
                  <p className="text-2xl font-black">{Math.round(students.reduce((a,s)=>a+(s.xp||0),0)/Math.max(students.length,1))}</p>
                  <p className="text-xs opacity-75">Avg XP</p>
                </div>
                <div className="rounded-2xl p-3 text-center" style={{background:'rgba(255,255,255,0.12)'}}>
                  <p className="text-2xl font-black">{Math.round(students.reduce((a,s)=>a+(s.streak||0),0)/Math.max(students.length,1))}</p>
                  <p className="text-xs opacity-75">Avg Streak</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-1">{activeView === 'students' ? 'Student Roster' : 'Detailed Progress'}</h3>
          <p className="text-xs text-slate-400 mb-4">Tap a student to view their mission history</p>
          {Object.entries(sections).sort(([a],[b])=>a.localeCompare(b)).map(([sec, studs]) => (
            <div key={sec} className="mb-4">
              <p className="text-xs font-bold text-indigo-600 uppercase mb-2 tracking-wider">Section {sec} ({studs.length})</p>
              {studs.map(s => (
                <button key={s.id} onClick={() => openStudentHistory(s)} className="w-full text-left flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-2 hover:bg-indigo-50 hover:border-indigo-200 transition-all group">
                  <div>
                    <p className="font-bold text-slate-800 text-sm group-hover:text-indigo-700">{s.username}</p>
                    <p className="text-xs text-slate-500">USN: {s.usn||'-'}{s.board_name ? ` • ${s.board_name}` : ''}</p>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    <div>
                      <p className="text-sm font-bold text-indigo-600 flex items-center gap-1"><Star size={12} className="text-yellow-500"/> {s.xp} XP</p>
                      <p className="text-xs text-orange-500 font-medium flex items-center gap-1"><Flame size={12}/> {s.streak} days</p>
                    </div>
                    <ChevronDown size={16} className="text-slate-400 group-hover:text-indigo-500"/>
                  </div>
                </button>
              ))}
            </div>
          ))}
          {students.length === 0 && <p className="text-sm text-slate-500 text-center py-8">No students assigned to your class/section.</p>}
          </div>
        </div>
        );})()}

      {activeView === 'history' && selectedStudent && (
        <div className="space-y-4">
          {/* Student header card */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-6 text-white">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center font-bold text-2xl">
                {selectedStudent.username[0].toUpperCase()}
              </div>
              <div>
                <h2 className="font-bold text-xl">{selectedStudent.username}</h2>
                <p className="text-indigo-200 text-sm">Class {selectedStudent.class_name||'N/A'}{selectedStudent.section_name?` - ${selectedStudent.section_name}`:''}{selectedStudent.board_name ? ` • ${selectedStudent.board_name}` : ''}</p>
                <p className="text-indigo-300 text-xs">USN: {selectedStudent.usn||'-'}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10">
                <Star className="mx-auto mb-1 text-yellow-300" size={16}/>
                <p className="text-xs opacity-75">Total XP</p>
                <p className="font-bold text-lg">{selectedStudent.xp}</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10">
                <Flame className="mx-auto mb-1 text-orange-300" size={16}/>
                <p className="text-xs opacity-75">Streak</p>
                <p className="font-bold text-lg">{selectedStudent.streak} days</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-2xl p-3 text-center border border-white/10">
                <CheckCircle className="mx-auto mb-1 text-emerald-300" size={16}/>
                <p className="text-xs opacity-75">Missions</p>
                <p className="font-bold text-lg">{studentHistory.length}</p>
              </div>
            </div>
          </div>

          {/* Subject Progress */}
          {studentSubjectProgress.length > 0 && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2"><BookOpen size={16} className="text-indigo-500"/> Subject Progress</h3>
              <div className="space-y-3">
                {Object.values(studentSubjectProgress.reduce((acc, p) => {
                  if (!acc[p.subject_id]) acc[p.subject_id] = { ...p, total_attempted: 0, total_correct: 0, xp_earned: 0 };
                  acc[p.subject_id].total_attempted += p.total_attempted || 0;
                  acc[p.subject_id].total_correct += p.total_correct || 0;
                  acc[p.subject_id].xp_earned += p.xp_earned || 0;
                  return acc;
                }, {})).map(p => {
                  const accuracy = p.total_attempted > 0 ? Math.round((p.total_correct / p.total_attempted) * 100) : 0;
                  return (
                    <div key={p.subject_id} className="flex items-center gap-3">
                      <span className="text-xl w-8">{p.icon}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-sm"><span className="font-bold text-slate-700">{p.subject_name}</span><span className="text-slate-500">{accuracy}% • {p.xp_earned} XP</span></div>
                        <div className="h-2 bg-slate-100 rounded-full mt-1 overflow-hidden"><div className="h-full rounded-full" style={{width:`${accuracy}%`, background: p.color || '#4f46e5'}}></div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mission history */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="font-bold text-slate-800 mb-4">Mission History (Last 30 Days)</h3>
            {loadingHistory && <p className="text-center text-slate-500 py-4">Loading history...</p>}
            {!loadingHistory && studentHistory.length === 0 && (
              <p className="text-center text-slate-500 py-6 text-sm">No missions completed yet.</p>
            )}
            {studentHistory.map((h, i) => (
              <div key={i} className="mb-3 border border-slate-100 rounded-2xl overflow-hidden">
                <button onClick={() => toggleDay(h.date)} className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex justify-between items-center">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{h.date}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="text-xs text-slate-500">V:{h.vocab_score||0}</span>
                      <span className="text-xs text-slate-500">G:{h.grammar_score||0}</span>
                      <span className="text-xs text-slate-500">S:{h.syllabus_score||0}</span>
                      <span className="text-xs text-slate-500">Sent:{h.sentence_score||0}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-emerald-600 font-bold text-sm">{h.correct}✓</span>
                      <span className="text-red-500 font-bold text-sm ml-2">{h.incorrect}✗</span>
                    </div>
                    {expandedDay === h.date ? <ChevronUp size={16} className="text-indigo-600"/> : <ChevronDown size={16} className="text-slate-400"/>}
                  </div>
                </button>

                {/* Score breakdown bar */}
                <div className="px-4 pb-2 flex gap-2">
                  <ScoreBadge label="Vocab" value={h.vocab_score||0} color="bg-indigo-50 text-indigo-700"/>
                  <ScoreBadge label="Grammar" value={h.grammar_score||0} color="bg-emerald-50 text-emerald-700"/>
                  <ScoreBadge label="Syllabus" value={h.syllabus_score||0} color="bg-pink-50 text-pink-700"/>
                  <ScoreBadge label="Sentence" value={h.sentence_score||0} color="bg-purple-50 text-purple-700"/>
                </div>

                {/* Per-question breakdown */}
                {expandedDay === h.date && (
                  <div className="border-t border-slate-100 p-4 bg-slate-50">
                    {!dayAnswers[h.date] && <p className="text-center text-slate-400 text-xs py-2">Loading details...</p>}
                    {dayAnswers[h.date] && dayAnswers[h.date].length === 0 && (
                      <p className="text-center text-slate-400 text-xs py-2">No detailed question data for this day.</p>
                    )}
                    {dayAnswers[h.date] && dayAnswers[h.date].map((a, j) => (
                      <div key={j} className={`flex items-start gap-3 p-3 rounded-xl mb-2 ${a.is_correct ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
                        <span className="text-lg">{a.is_correct ? '✅' : '❌'}</span>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-600 capitalize mb-0.5">{a.section}</p>
                          <p className="text-sm text-slate-800">{a.question_text}</p>
                          {!a.is_correct && (
                            <p className="text-xs text-red-600 mt-1">Selected: Option {a.selected_index + 1} | Correct: Option {a.correct_index + 1}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}


      {activeView === 'messages' && (
          <div className="flex flex-col md:flex-row gap-6 h-[70vh]">
              {/* Student List */}
              <div className="w-full md:w-1/3 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-y-auto custom-scrollbar">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100">Conversations</h3>
                  </div>
                  <div className="p-2 space-y-1">
                      {students.map(s => (
                          <button key={s.id} onClick={() => setSelectedStudent(s)} className={`w-full text-left p-3 rounded-xl transition-colors ${selectedStudent?.id === s.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}`}>
                              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{s.username}</p>
                              <p className="text-xs text-slate-500">Class {s.class_name}</p>
                          </button>
                      ))}
                  </div>
              </div>

              {/* Chat Area */}
              <div className="w-full md:w-2/3 bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col">
                  {selectedStudent ? (
                      <>
                          <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-3xl">
                              <h3 className="font-bold text-slate-800 dark:text-slate-100">{selectedStudent.username}</h3>
                              <p className="text-xs text-slate-500">Chat & Doubts</p>
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950">
                              {messages.length === 0 ? (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                      <MessageCircle size={48} className="mb-2 opacity-50" />
                                      <p className="text-sm">No messages yet.</p>
                                  </div>
                              ) : (
                                  messages.map((m, i) => (
                                      <div key={i} className={`flex flex-col ${!m.sender_id || m.sender_role === 'STAFF' ? 'items-end' : 'items-start'}`}>
                                          <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${!m.sender_id || m.sender_role === 'STAFF' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none shadow-sm'}`}>
                                              {m.message}
                                          </div>
                                          <span className="text-[10px] text-slate-400 mt-1 mx-1">{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                      </div>
                                  ))
                              )}
                          </div>
                          <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 rounded-b-3xl">
                              <form onSubmit={sendMessage} className="flex gap-2">
                                  <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type a message..." className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white" />
                                  <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white w-10 h-10 rounded-xl flex items-center justify-center transition-colors shadow-sm"><Send size={18} className="ml-1"/></button>
                              </form>
                          </div>
                      </>
                  ) : (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <MessageCircle size={64} className="mb-4 opacity-50" />
                          <p>Select a student to view messages</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {activeView === 'reports' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 text-center">
          <Send className="mx-auto text-slate-300 mb-4" size={48}/>
          <h3 className="font-bold text-slate-800 mb-2">Class Performance Report</h3>
          <p className="text-sm text-slate-500 mb-4">{students.length} students in your class/section</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-indigo-50 rounded-2xl p-4">
              <p className="text-2xl font-bold text-indigo-700">{students.reduce((a,s)=>a+(s.xp||0),0)}</p>
              <p className="text-xs text-indigo-500">Total XP Earned</p>
            </div>
            <div className="bg-orange-50 rounded-2xl p-4">
              <p className="text-2xl font-bold text-orange-700">{students.filter(s=>(s.streak||0)>=3).length}</p>
              <p className="text-xs text-orange-500">Active Streaks (3+)</p>
            </div>
          </div>
          <button onClick={downloadPDF} className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto hover:shadow-lg transition-all">
            <Download size={18}/> Download PDF Report
          </button>
        </div>
      )}

      {activeView === 'sendnotif' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">Send Notification</h3>
          <form onSubmit={async(e)=>{e.preventDefault();if(!notifMsg.trim())return;try{const h={Authorization:`Bearer ${localStorage.getItem('token')}`};await axios.post('/api/notifications',{message:notifMsg,target_role:notifRole||null},{headers:h});alert('Notification sent!');setNotifMsg('');setNotifRole('');const r=await axios.get('/api/notifications',{headers:h});setNotifications(r.data);}catch(err){alert('Error');}}} className="space-y-4">
            <div><label className="block text-sm font-medium mb-1">Message</label><textarea required className="w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" rows={3} value={notifMsg} onChange={e=>setNotifMsg(e.target.value)} placeholder="Type notification message..."/></div>
            <div><label className="block text-sm font-medium mb-1">Target Audience</label><select className="w-full border border-slate-200 p-2.5 rounded-lg text-sm" value={notifRole} onChange={e=>setNotifRole(e.target.value)}><option value="">Everyone in School</option><option value="STUDENT">Students Only</option><option value="PARENT">Parents Only</option></select></div>
            <button type="submit" className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all">Send Notification</button>
          </form>
        </div>
      )}

      {activeView === 'notif' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">Received Notifications</h3>
          {notifications.map((n,i)=><div key={i} className="p-3 border-b border-slate-100 last:border-0">
            <p className="text-sm text-slate-700">{n.message}</p>
            <p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
          </div>)}
          {notifications.length===0 && <p className="text-slate-500 text-sm text-center py-4">No notifications yet.</p>}
        </div>
      )}
    </DashboardLayout>
  );
}
