'use client';
import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Building, Users, Database, FileText, Bell, Plus, Trash2, ChevronRight, Download, X, ArrowLeft } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';

export default function AdminDashboard() {
  const [stats, setStats] = useState({ schools: 0, total_users: 0 });
  const [schools, setSchools] = useState([]);
  const [users, setUsers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeTab, setActiveTab] = useState('schools');
  const [showSchoolModal, setShowSchoolModal] = useState(false);
  const [schoolForm, setSchoolForm] = useState({ name: '', address: '' });
  const [showUserModal, setShowUserModal] = useState(false);
  const [userForm, setUserForm] = useState({ username:'', password:'', role:'STUDENT', usn:'', school_id:'', class_name:'', section_name:'', mapped_student_id:'' });

  // Data Engine
  const [selectedClass, setSelectedClass] = useState(null);
  const [dataTab, setDataTab] = useState(null);
  // Data Engine Batches
  const [vocabBatch, setVocabBatch] = useState(Array(5).fill(null).map(() => ({ word:'', meaning:'', options:['','','',''], correct_index:0 })));
  const [grammarBatch, setGrammarBatch] = useState(Array(5).fill(null).map(() => ({ level:'intermediate', topic:'', content:'', question_text:'', options:['','','',''], correct_answer:'' })));
  const [syllabusBatch, setSyllabusBatch] = useState(Array(5).fill(null).map(() => ({ subject:'', lesson_title:'', content:'', quiz_q:'', quiz_opts:['','','',''], correct_answer:'' })));
  
  const generateDistractors = (answer, category) => {
    let pool = [];
    if(category === 'vocab') pool = ["A feeling of intense joy", "A dark and gloomy place", "Extremely fast movement", "To build or create", "To destroy completely", "Having great wealth", "Lacking basic needs", "To speak softly", "To shout loudly", "A complex puzzle", "A simple solution", "To agree completely", "To argue violently", "A pleasant smell", "A terrible odor"];
    if(category === 'grammar') pool = ["is", "are", "was", "were", "has", "have", "had", "do", "does", "did", answer+"s", answer+"ing", answer+"ed", "to "+answer];
    if(category === 'syllabus') pool = ["True", "False", "None of the above", "All of the above", "Depends on context", "Insufficient info"];
    
    let distractors = pool.filter(x => x && x.toLowerCase() !== answer.toLowerCase()).sort(() => 0.5 - Math.random());
    while(distractors.length < 3) distractors.push(["Option A", "Option B", "Option C", "Option D"][distractors.length]);
    return distractors.slice(0, 3);
  };
  
  const autoFillOptions = (index, category) => {
    if(category === 'vocab') {
      const b = [...vocabBatch];
      const ans = b[index].meaning;
      if(!ans) return alert('Enter correct meaning first');
      const dists = generateDistractors(ans, 'vocab');
      const opts = [ans, ...dists].sort(() => 0.5 - Math.random());
      b[index].options = opts;
      b[index].correct_index = opts.indexOf(ans);
      setVocabBatch(b);
    } else if(category === 'grammar') {
      const b = [...grammarBatch];
      const ans = b[index].correct_answer;
      if(!ans) return alert('Enter correct answer first');
      const dists = generateDistractors(ans, 'grammar');
      const opts = [ans, ...dists].sort(() => 0.5 - Math.random());
      b[index].options = opts;
      setGrammarBatch(b);
    } else if(category === 'syllabus') {
      const b = [...syllabusBatch];
      const ans = b[index].correct_answer;
      if(!ans) return alert('Enter correct answer first');
      const dists = generateDistractors(ans, 'syllabus');
      const opts = [ans, ...dists].sort(() => 0.5 - Math.random());
      b[index].quiz_opts = opts;
      setSyllabusBatch(b);
    }
  };

  // Tests
  const [testForm, setTestForm] = useState({ school_id:'', class_name:'', section_name:'', title:'', questions:[{q:'',opts:['','','',''],ans:0}] });
  const [tests, setTests] = useState([]);

  // MCQ Sets
  const [mcqSets, setMcqSets] = useState([]);
  const [mcqForm, setMcqForm] = useState({ school_id:'', class_name:'', category:'meaning', title:'', questions: Array(5).fill(null).map(()=>({q:'',opts:['','','',''],ans:0})) });

  // Sentence Exercises
  const [sentExercises, setSentExercises] = useState([]);
  const [sentForm, setSentForm] = useState({ school_id:'', class_name:'', correct_sentence:'', words:['','','','','','',''] });
  const [vocabSubTab, setVocabSubTab] = useState('meaning');

  // School detail
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [schoolDetail, setSchoolDetail] = useState(null);

  // Data listings
  const [dataList, setDataList] = useState([]);
  const [dataCounts, setDataCounts] = useState({ meaning:0, synonym:0, antonym:0, grammar:0, syllabus:0, sentence:0 });

  const router = useRouter();
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    const token = localStorage.getItem('token');
    if (!token) return router.push('/');
    const h = { Authorization: `Bearer ${token}` };
    try {
      const [statRes, schoolRes, userRes, notifRes] = await Promise.all([
        axios.get('/api/admin/overview', { headers: h }),
        axios.get('/api/admin/schools', { headers: h }),
        axios.get('/api/admin/users', { headers: h }),
        axios.get('/api/notifications', { headers: h }).catch(() => ({ data: [] }))
      ]);
      setStats(statRes.data); setSchools(schoolRes.data); setUsers(userRes.data); setNotifications(notifRes.data);
    } catch(err) { if(err.response?.status===401||err.response?.status===403) { localStorage.clear(); router.push('/'); } }
  };

  const handleAddSchool = async(e) => { e.preventDefault(); try { await axios.post('/api/admin/schools', schoolForm, { headers: headers() }); setShowSchoolModal(false); setSchoolForm({name:'',address:''}); fetchData(); } catch(err) { alert(err.response?.data?.error||'Error'); }};
  const handleAddUser = async(e) => { e.preventDefault(); try { await axios.post('/api/admin/user', userForm, { headers: headers() }); setShowUserModal(false); setUserForm({username:'',password:'',role:'STUDENT',usn:'',school_id:'',class_name:'',section_name:'',mapped_student_id:''}); fetchData(); } catch(err) { alert(err.response?.data?.error||'Error'); }};
  const handleDeleteSchool = async(id) => { if(!confirm('Delete this school?')) return; try { await axios.delete(`/api/admin/schools/${id}`, { headers: headers() }); fetchData(); } catch(err) { alert('Error'); }};
  const handleDeleteUser = async(id) => { if(!confirm('Delete this user?')) return; try { await axios.delete(`/api/admin/user/${id}`, { headers: headers() }); fetchData(); } catch(err) { alert('Error'); }};

  const handleDataSubmit = async(e, type) => {
    e.preventDefault();
    const h = headers();
    const countKey = type === 'vocab' ? vocabSubTab : type;
    const currentCount = dataCounts[countKey] || 0;
    
    try {
      if (type==='vocab') { 
        const payload = vocabBatch.filter(v => v.word && v.meaning).map(v => {
          let ansIdx = v.options.indexOf(v.meaning);
          if (ansIdx === -1) ansIdx = v.correct_index;
          return {...v, type: vocabSubTab, class_name: selectedClass, correct_index: ansIdx};
        });
        if(payload.length === 0) return alert('No valid data to submit');
        if(currentCount + payload.length > 5) return alert(`Maximum 5 questions allowed. You have ${currentCount}. Delete existing entries first.`);
        await axios.post('/api/admin/data/vocab/bulk', { items: payload }, { headers: h }); 
        setVocabBatch(Array(5).fill(null).map(() => ({ word:'', meaning:'', options:['','','',''], correct_index:0 }))); 
        alert('Vocab batch added!'); 
      }
      else if (type==='grammar') { 
        const payload = grammarBatch.filter(g => g.topic && g.correct_answer).map(g => {
          let ansIdx = g.options.indexOf(g.correct_answer);
          if (ansIdx === -1) ansIdx = 0; // Fallback
          return {...g, class_name: selectedClass, correct_answer: ansIdx.toString()};
        });
        if(payload.length === 0) return alert('No valid data to submit');
        await axios.post('/api/admin/data/grammar/bulk', { items: payload }, { headers: h }); 
        setGrammarBatch(Array(5).fill(null).map(() => ({ level:'intermediate', topic:'', content:'', question_text:'', options:['','','',''], correct_answer:'' }))); 
        alert('Grammar batch added!'); 
      }
      else if (type==='syllabus') { 
        const payload = syllabusBatch.filter(s => s.subject && s.lesson_title).map(s => ({...s, class_name: selectedClass, quiz_data:[{q:s.quiz_q, opts:s.quiz_opts, ans:s.quiz_opts.indexOf(s.correct_answer)}]}));
        if(payload.length === 0) return alert('No valid data to submit');
        await axios.post('/api/admin/data/syllabus/bulk', { items: payload }, { headers: h }); 
        setSyllabusBatch(Array(5).fill(null).map(() => ({ subject:'', lesson_title:'', content:'', quiz_q:'', quiz_opts:['','','',''], correct_answer:'' }))); 
        alert('Syllabus batch added!'); 
      }
      fetchDataList(dataTab, selectedClass);
      fetchDataCounts(selectedClass);
    } catch(err) { alert(err.response?.data?.error||'Error'); }
  };

  const handleTestSubmit = async(e) => {
    e.preventDefault();
    try { await axios.post('/api/admin/tests', testForm, { headers: headers() }); setTestForm({school_id:'',class_name:'',section_name:'',title:'',questions:[{q:'',opts:['','','',''],ans:0}]}); alert('Test created!'); fetchTests(); } catch(err) { alert('Error'); }
  };
  const fetchTests = async() => { try { const res = await axios.get('/api/admin/tests', { headers: headers() }); setTests(res.data); } catch(e){} };
  const fetchMcqSets = async() => { try { const res = await axios.get('/api/admin/mcq-sets', { headers: headers() }); setMcqSets(res.data); } catch(e){} };
  const fetchSentExercises = async() => { try { const res = await axios.get('/api/admin/sentence-exercises', { headers: headers() }); setSentExercises(res.data); } catch(e){} };
  useEffect(() => { if(activeTab==='tests') fetchTests(); if(activeTab==='data') fetchSentExercises(); }, [activeTab]);

  const openSchoolDetail = async(school) => { setSelectedSchool(school); try { const res = await axios.get(`/api/admin/schools/${school.id}/details`, { headers: headers() }); setSchoolDetail(res.data); } catch(e){} };
  const closeSchoolDetail = () => { setSelectedSchool(null); setSchoolDetail(null); };

  const fetchDataList = async(type, cls) => { try { const res = await axios.get(`/api/admin/data/${type}?class_name=${cls}`, { headers: headers() }); setDataList(res.data); } catch(e){ setDataList([]); } };
  const fetchDataCounts = async(cls) => { try { const res = await axios.get(`/api/admin/data/counts?class_name=${cls}`, { headers: headers() }); setDataCounts(res.data); } catch(e){} };
  const deleteDataItem = async(type, id) => { if(!confirm('Delete?')) return; try { await axios.delete(`/api/admin/data/${type}/${id}`, { headers: headers() }); fetchDataList(dataTab==='vocab'?'vocab':dataTab, selectedClass); fetchDataCounts(selectedClass); } catch(e){} };
  const deleteTest = async(id) => { if(!confirm('Delete this test?')) return; try { await axios.delete(`/api/admin/tests/${id}`, { headers: headers() }); fetchTests(); } catch(e){} };

  useEffect(() => { if(selectedClass && dataTab) fetchDataList(dataTab, selectedClass); }, [dataTab, selectedClass]);
  useEffect(() => { if(selectedClass) fetchDataCounts(selectedClass); }, [selectedClass]);

  const addTestQuestion = () => setTestForm({...testForm, questions:[...testForm.questions, {q:'',opts:['','','',''],ans:0}]});

  const handleMcqSubmit = async(e) => {
    e.preventDefault();
    try {
      await axios.post('/api/admin/mcq-sets', { school_id: mcqForm.school_id, class_name: mcqForm.class_name, category: mcqForm.category, title: mcqForm.title, questions_json: JSON.stringify(mcqForm.questions) }, { headers: headers() });
      setMcqForm({ school_id:'', class_name:'', category:'meaning', title:'', questions: Array(5).fill(null).map(()=>({q:'',opts:['','','',''],ans:0})) });
      alert('MCQ Set created!'); fetchMcqSets();
    } catch(err) { alert('Error'); }
  };
  const handleDeleteMcq = async(id) => { if(!confirm('Delete?')) return; try { await axios.delete(`/api/admin/mcq-sets/${id}`, { headers: headers() }); fetchMcqSets(); } catch(e){} };

  const handleSentSubmit = async(e) => {
    e.preventDefault();
    const words = sentForm.words.filter(w=>w.trim());
    if(words.length<3) return alert('At least 3 words required');
    try {
      await axios.post('/api/admin/sentence-exercises', { school_id: sentForm.school_id, class_name: sentForm.class_name, correct_sentence: sentForm.correct_sentence, words_json: JSON.stringify(words) }, { headers: headers() });
      setSentForm({ school_id:'', class_name:'', correct_sentence:'', words:['','','','',''] });
      alert('Sentence exercise created!'); fetchSentExercises();
    } catch(err) { alert('Error'); }
  };
  const handleDeleteSent = async(id) => { if(!confirm('Delete?')) return; try { await axios.delete(`/api/admin/sentence-exercises/${id}`, { headers: headers() }); fetchSentExercises(); if(selectedClass) fetchDataCounts(selectedClass); } catch(e){} };
  const autoFillWords = () => {
    if(!sentForm.correct_sentence) return alert('Enter sentence first');
    const words = sentForm.correct_sentence.trim().split(/\s+/).filter(w=>w);
    const shuffled = [...words].sort(()=>0.5-Math.random());
    setSentForm({...sentForm, words: shuffled});
  };
  const addWordSlot = () => setSentForm({...sentForm, words:[...sentForm.words,'']});
  const removeWordSlot = (i) => { const ws=[...sentForm.words]; ws.splice(i,1); setSentForm({...sentForm,words:ws}); };

  const inputCls = "w-full border border-slate-200 p-2.5 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none";
  const btnCls = "bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all";

  const tabs = [['schools','Schools',Building],['users','Users',Users],['data','Data',Database],['tests','Tests',FileText],['notif','Alerts',Bell]];

  return (
    <DashboardLayout subtitle="Admin Dashboard" tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} roleColor="indigo">
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center"><div className="p-3 bg-indigo-100 text-indigo-600 rounded-xl"><Building size={20}/></div><div><p className="text-xs text-slate-500 font-medium">Schools</p><p className="text-xl font-bold text-slate-800">{stats.schools}</p></div></div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col items-center gap-2 text-center"><div className="p-3 bg-emerald-100 text-emerald-600 rounded-xl"><Users size={20}/></div><div><p className="text-xs text-slate-500 font-medium">Users</p><p className="text-xl font-bold text-slate-800">{stats.total_users}</p></div></div>
        </div>

        {activeTab==='schools' && !selectedSchool && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">Schools</h3><button onClick={()=>setShowSchoolModal(true)} className={btnCls + " flex items-center gap-2"}><Plus size={16}/> Add School</button></div>
            <p className="text-sm text-slate-500 mb-4">Click a school to manage classes, staff, students & parents.</p>
            {schools.map(s=>(<div key={s.id} role="button" onClick={()=>openSchoolDetail(s)} className="w-full cursor-pointer text-left flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-3 hover:bg-indigo-50 hover:border-indigo-200 transition-all group">
              <div><p className="font-bold text-slate-800 group-hover:text-indigo-700">{s.name}</p><p className="text-sm text-slate-500">{s.address||'No address'}</p></div>
              <div className="flex items-center gap-3"><button onClick={(e)=>{e.stopPropagation();handleDeleteSchool(s.id)}} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button><ChevronRight size={18} className="text-slate-400 group-hover:text-indigo-500"/></div>
            </div>))}
            {schools.length===0 && <p className="text-slate-500 text-center py-8">No schools yet. Click "Add School" to get started.</p>}
          </div>
        )}

        {activeTab==='schools' && selectedSchool && schoolDetail && (
          <div className="space-y-6">
            <button onClick={closeSchoolDetail} className="flex items-center gap-2 text-indigo-600 font-bold"><ArrowLeft size={18}/> Back to Schools</button>
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-3xl p-6 text-white">
              <h2 className="text-2xl font-bold">{schoolDetail.school.name}</h2>
              <p className="text-indigo-200">{schoolDetail.school.address||'No address'}</p>
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{schoolDetail.classes.length}</p><p className="text-xs opacity-75">Classes</p></div>
                <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{schoolDetail.users.filter(u=>u.role==='STAFF').length}</p><p className="text-xs opacity-75">Staff</p></div>
                <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{schoolDetail.users.filter(u=>u.role==='STUDENT').length}</p><p className="text-xs opacity-75">Students</p></div>
                <div className="bg-white/10 rounded-xl p-3 text-center"><p className="text-xl font-bold">{schoolDetail.users.filter(u=>u.role==='PARENT').length}</p><p className="text-xs opacity-75">Parents</p></div>
              </div>
            </div>
            {schoolDetail.classes.map(cls => {
              const clsStaff = schoolDetail.users.filter(u=>u.role==='STAFF'&&u.class_name===cls);
              const clsStudents = schoolDetail.users.filter(u=>u.role==='STUDENT'&&u.class_name===cls);
              return (<div key={cls} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 mb-3">Class {cls}</h3>
                {clsStaff.length>0 && <div className="mb-3"><p className="text-xs font-bold text-indigo-600 mb-1">Staff Assigned:</p>{clsStaff.map(s=><span key={s.id} className="inline-block bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-medium mr-2">{s.username}{s.section_name?` (${s.section_name})`:''}</span>)}</div>}
                {clsStudents.length>0 && <table className="w-full text-sm"><thead><tr className="border-b text-slate-500"><th className="pb-2 text-left">Student</th><th className="pb-2">USN</th><th className="pb-2">Section</th><th className="pb-2">XP</th><th className="pb-2">Mapped Parent</th></tr></thead><tbody>{clsStudents.map(s=>{const parent=schoolDetail.users.find(u=>u.role==='PARENT'&&u.mapped_student_id===s.id); return <tr key={s.id} className="border-b border-slate-50"><td className="py-2 font-medium">{s.username}</td><td className="py-2 text-slate-500">{s.usn||'-'}</td><td className="py-2">{s.section_name||'-'}</td><td className="py-2 text-indigo-600 font-bold">{s.xp||0}</td><td className="py-2 text-slate-500">{parent?parent.username:'—'}</td></tr>})}</tbody></table>}
                {clsStudents.length===0 && <p className="text-slate-400 text-sm">No students in this class.</p>}
              </div>);
            })}
            {schoolDetail.classes.length===0 && <p className="text-slate-500 bg-white rounded-2xl p-6 text-center">No classes yet. Add users with a class assignment to create classes.</p>}
          </div>
        )}

        {activeTab==='users' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 overflow-x-auto">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-bold text-slate-800">Users</h3><button onClick={()=>setShowUserModal(true)} className={btnCls + " flex items-center gap-2"}><Plus size={16}/> Add</button></div>
            <table className="w-full text-left whitespace-nowrap"><thead><tr className="border-b border-slate-200 text-slate-500 text-sm"><th className="pb-3 pr-4">Username</th><th className="pb-3 pr-4">Role</th><th className="pb-3 pr-4">School</th><th className="pb-3 pr-4">Details</th><th className="pb-3 text-right">Actions</th></tr></thead>
              <tbody>{users.map(u=><tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50"><td className="py-4 pr-4 font-semibold text-slate-800">{u.username}</td><td className="py-4 pr-4"><span className={`px-2 py-1 rounded text-xs font-bold ${u.role==='ADMIN'?'bg-red-100 text-red-700':u.role==='PRINCIPAL'?'bg-purple-100 text-purple-700':u.role==='STAFF'?'bg-blue-100 text-blue-700':u.role==='STUDENT'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{u.role}</span></td><td className="py-4 pr-4 text-slate-600">{u.school_name||'All Schools'}</td><td className="py-4 pr-4 text-slate-600">{u.class_name?`Class ${u.class_name}`:'No Class'}{u.section_name?` (Sec ${u.section_name})`:''} {u.usn?`| USN: ${u.usn}`:''}</td><td className="py-4 text-right"><button onClick={()=>handleDeleteUser(u.id)} className="text-red-500 hover:text-red-700 font-bold text-sm">Del</button></td></tr>)}</tbody></table>
          </div>
        )}

        {activeTab==='data' && (
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Data Engine</h3>
            {!selectedClass ? (
              <div><p className="text-slate-500 mb-4 font-medium text-sm">Select a class to begin adding content:</p>
                <div className="grid grid-cols-3 gap-3">{Array.from({length:10},(_,i)=>i+1).map(c=>(
                  <button key={c} onClick={()=>setSelectedClass(String(c))} className="bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold text-lg p-4 rounded-2xl transition-all border-2 border-transparent hover:border-indigo-600">C{c}</button>
                ))}</div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-4 mb-6"><button onClick={()=>{setSelectedClass(null);setDataTab(null);}} className="text-indigo-600 font-bold">← Back to Classes</button><span className="bg-indigo-100 text-indigo-700 font-bold px-4 py-2 rounded-lg">Class {selectedClass}</span></div>
                <div className="bg-indigo-50 rounded-xl p-3 mb-6 text-xs text-indigo-700"><strong>Daily Task Formula:</strong> 5 Words + 5 Synonyms + 5 Antonyms + 5 Grammar + 5 Syllabus + 5 Sentence Formation = <strong>30 Questions</strong></div>
                {!dataTab ? (
                  <div className="grid grid-cols-2 gap-3">
                    {[['vocab','📚','Words (Meaning)','indigo','meaning'],['synonym','🔗','Synonyms','emerald','synonym'],['antonym','🔄','Antonyms','pink','antonym'],['grammar','✏️','Grammar','amber','grammar'],['syllabus','📖','Syllabus','teal','syllabus'],['sentence','🔤','Sentence Formation','purple','sentence']].map(([tab,icon,label,color,type])=>{
                      const count = dataCounts[type] || 0;
                      const full = count >= 5;
                      return (
                        <button key={tab} onClick={()=>{setDataTab(tab==='synonym'||tab==='antonym'?'vocab':tab);if(['meaning','synonym','antonym'].includes(type))setVocabSubTab(type);}} className={`text-left p-5 rounded-2xl shadow-sm border transition-all ${full?'bg-emerald-50 border-emerald-200':'bg-white border-slate-100 hover:bg-slate-50'}`}>
                          <div className="text-3xl mb-3">{icon}</div>
                          <h4 className="font-bold text-slate-800 text-sm">{label}</h4>
                          <p className={`text-xs mt-1 font-bold ${full?'text-emerald-600':'text-slate-400'}`}>{count}/5 {full?'✓ Complete':'questions'}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : (<div>
                  <button onClick={()=>setDataTab(null)} className="text-indigo-600 font-bold text-sm mb-4">← Back to Modules</button>
                {dataTab==='vocab' && (
                  <div className="space-y-4 max-w-xl">
                    {/* Sub-tabs for vocab types */}
                    <div className="flex gap-2 mb-2">
                      {[['meaning','📖 Meaning'],['synonym','🔗 Synonym'],['antonym','🔄 Antonym']].map(([t,l])=>(
                        <button key={t} onClick={()=>setVocabSubTab(t)} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${vocabSubTab===t?'bg-indigo-600 text-white':'bg-slate-100 text-slate-600 hover:bg-indigo-50'}`}>
                          {l} <span className={`ml-1 text-xs ${(dataCounts[t]||0)>=5?'text-emerald-400':'opacity-60'}`}>({dataCounts[t]||0}/5)</span>
                        </button>
                      ))}
                    </div>
                    {(dataCounts[vocabSubTab]||0)>=5 && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 font-medium">✓ 5 {vocabSubTab} questions complete. Delete existing to replace.</div>}
                    <form onSubmit={e=>handleDataSubmit(e,'vocab')} className="space-y-6 w-full max-w-5xl">
                      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-slate-500"><th className="p-3 w-10">#</th><th className="p-3 w-1/4">Word</th><th className="p-3 w-1/4">{vocabSubTab} (Answer)</th><th className="p-3">Options (Auto-generated)</th><th className="p-3 w-14 text-center">⚡</th></tr></thead>
                          <tbody>
                            {vocabBatch.map((v,i)=>(
                              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="p-3 text-slate-400 font-bold">{i+1}</td>
                                <td className="p-3"><input required className={inputCls+" py-1.5"} value={v.word} onChange={e=>{const b=[...vocabBatch];b[i].word=e.target.value;setVocabBatch(b)}} placeholder="Word" /></td>
                                <td className="p-3"><input required className={inputCls+" py-1.5 font-bold text-indigo-700"} value={v.meaning} onChange={e=>{const b=[...vocabBatch];b[i].meaning=e.target.value;setVocabBatch(b)}} placeholder="Correct Answer" /></td>
                                <td className="p-3">
                                  <div className="grid grid-cols-2 gap-1">
                                    {v.options.map((o,oi)=><input key={oi} required className={`w-full border border-slate-200 p-1.5 rounded text-xs ${v.correct_index===oi?'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold':''}`} value={o} onChange={e=>{const b=[...vocabBatch];b[i].options[oi]=e.target.value;if(e.target.value===v.meaning)b[i].correct_index=oi;setVocabBatch(b)}} placeholder={`Option ${oi+1}`} />)}
                                  </div>
                                </td>
                                <td className="p-3 text-center"><button type="button" onClick={()=>autoFillOptions(i,'vocab')} className="bg-indigo-100 text-indigo-600 p-2 rounded hover:bg-indigo-200 shadow-sm" title="Auto-generate distractors">⚡</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex gap-3">
                        <button type="submit" className={btnCls}>Submit Batch ({vocabBatch.filter(v=>v.word&&v.meaning).length}/5)</button>
                        {(dataCounts[vocabSubTab]||0)<5&&<span className="text-sm text-slate-400 self-center">{Math.max(0, 5-(dataCounts[vocabSubTab]||0))} more slots available</span>}
                      </div>
                    </form>
                  </div>
                )}
                {dataTab==='grammar' && (
                  <form onSubmit={e=>handleDataSubmit(e,'grammar')} className="space-y-6 w-full max-w-6xl">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-slate-500"><th className="p-3 w-10">#</th><th className="p-3 w-1/5">Topic / Explanation</th><th className="p-3 w-1/4">Question (use ____)</th><th className="p-3 w-1/6">Correct Ans</th><th className="p-3">Options</th><th className="p-3 w-12">⚡</th></tr></thead>
                          <tbody>
                            {grammarBatch.map((g,i)=>(
                              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="p-2 text-slate-400 font-bold text-center">{i+1}</td>
                                <td className="p-2"><input required className={inputCls+" py-1 text-xs mb-1"} value={g.topic} onChange={e=>{const b=[...grammarBatch];b[i].topic=e.target.value;setGrammarBatch(b)}} placeholder="Topic" /><input required className={inputCls+" py-1 text-xs"} value={g.content} onChange={e=>{const b=[...grammarBatch];b[i].content=e.target.value;setGrammarBatch(b)}} placeholder="Explanation" /></td>
                                <td className="p-2"><textarea required rows={2} className={inputCls+" py-1 text-xs resize-none"} value={g.question_text} onChange={e=>{const b=[...grammarBatch];b[i].question_text=e.target.value;setGrammarBatch(b)}} placeholder="E.g. She ____ to the store." /></td>
                                <td className="p-2"><input required className={inputCls+" py-1.5 text-xs font-bold text-amber-700"} value={g.correct_answer} onChange={e=>{const b=[...grammarBatch];b[i].correct_answer=e.target.value;setGrammarBatch(b)}} placeholder="Answer" /></td>
                                <td className="p-2">
                                  <div className="grid grid-cols-2 gap-1">
                                    {g.options.map((o,oi)=><input key={oi} required className={`w-full border border-slate-200 p-1 rounded text-xs ${g.correct_answer&&g.correct_answer===o?'bg-emerald-50 border-emerald-300 font-bold text-emerald-700':''}`} value={o} onChange={e=>{const b=[...grammarBatch];b[i].options[oi]=e.target.value;setGrammarBatch(b)}} placeholder={`Opt ${oi+1}`} />)}
                                  </div>
                                </td>
                                <td className="p-2"><button type="button" onClick={()=>autoFillOptions(i,'grammar')} className="bg-amber-100 text-amber-600 p-2 rounded hover:bg-amber-200 shadow-sm" title="Auto-generate distractors">⚡</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    <button type="submit" className={btnCls}>Submit Grammar Batch</button>
                  </form>
                )}
                {dataTab==='syllabus' && (
                  <form onSubmit={e=>handleDataSubmit(e,'syllabus')} className="space-y-6 w-full max-w-6xl">
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-sm">
                          <thead className="bg-slate-50 border-b border-slate-200"><tr className="text-slate-500"><th className="p-3 w-10">#</th><th className="p-3 w-1/5">Subject / Lesson</th><th className="p-3 w-1/4">Content & Quiz Q</th><th className="p-3 w-1/6">Correct Ans</th><th className="p-3">Options</th><th className="p-3 w-12">⚡</th></tr></thead>
                          <tbody>
                            {syllabusBatch.map((s,i)=>(
                              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="p-2 text-slate-400 font-bold text-center">{i+1}</td>
                                <td className="p-2"><input required className={inputCls+" py-1 text-xs mb-1"} value={s.subject} onChange={e=>{const b=[...syllabusBatch];b[i].subject=e.target.value;setSyllabusBatch(b)}} placeholder="Subject" /><input required className={inputCls+" py-1 text-xs"} value={s.lesson_title} onChange={e=>{const b=[...syllabusBatch];b[i].lesson_title=e.target.value;setSyllabusBatch(b)}} placeholder="Lesson Title" /></td>
                                <td className="p-2"><textarea required rows={2} className={inputCls+" py-1 text-xs mb-1 resize-none"} value={s.content} onChange={e=>{const b=[...syllabusBatch];b[i].content=e.target.value;setSyllabusBatch(b)}} placeholder="Explanation" /><input required className={inputCls+" py-1 text-xs"} value={s.quiz_q} onChange={e=>{const b=[...syllabusBatch];b[i].quiz_q=e.target.value;setSyllabusBatch(b)}} placeholder="Quiz Q" /></td>
                                <td className="p-2"><input required className={inputCls+" py-1.5 text-xs font-bold text-teal-700"} value={s.correct_answer} onChange={e=>{const b=[...syllabusBatch];b[i].correct_answer=e.target.value;setSyllabusBatch(b)}} placeholder="Answer" /></td>
                                <td className="p-2">
                                  <div className="grid grid-cols-2 gap-1">
                                    {s.quiz_opts.map((o,oi)=><input key={oi} required className={`w-full border border-slate-200 p-1 rounded text-xs ${s.correct_answer&&s.correct_answer===o?'bg-emerald-50 border-emerald-300 font-bold text-emerald-700':''}`} value={o} onChange={e=>{const b=[...syllabusBatch];b[i].quiz_opts[oi]=e.target.value;setSyllabusBatch(b)}} placeholder={`Opt ${oi+1}`} />)}
                                  </div>
                                </td>
                                <td className="p-2"><button type="button" onClick={()=>autoFillOptions(i,'syllabus')} className="bg-teal-100 text-teal-600 p-2 rounded hover:bg-teal-200 shadow-sm" title="Auto-generate distractors">⚡</button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    <button type="submit" className={btnCls}>Submit Syllabus Batch</button>
                  </form>
                )}
                {dataTab==='sentence' && (
                  <div className="space-y-4 max-w-xl">
                    <div className="bg-purple-50 rounded-xl p-3 text-xs text-purple-700"><strong>Sentence Formation:</strong> Students arrange shuffled words into the correct sentence. 5 questions only per class.</div>
                    {(dataCounts['sentence']||0)>=5 && <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-700 font-medium">✓ 5 sentence questions complete. Delete existing to replace.</div>}
                    {(dataCounts['sentence']||0)<5 && <span className="text-sm text-slate-400 self-center">{Math.max(0, 5-(dataCounts['sentence']||0))} more slots available</span>}
                    <form onSubmit={async(e)=>{
                      e.preventDefault();
                      if ((dataCounts['sentence']||0) >= 5) {
                        return alert(`Maximum 5 questions allowed. You have ${dataCounts['sentence']}. Delete existing entries first.`);
                      }
                      const words=sentForm.words.filter(w=>w.trim());
                      if(words.length<3)return alert('At least 3 words required');
                      try{
                        await axios.post('/api/admin/sentence-exercises',{school_id:sentForm.school_id||schools[0]?.id,class_name:selectedClass,correct_sentence:sentForm.correct_sentence,words_json:JSON.stringify(words)},{headers:headers()});
                        setSentForm({school_id:'',class_name:'',correct_sentence:'',words:['','','','','','','']});
                        alert('Sentence exercise added!');
                        fetchSentExercises();
                        fetchDataCounts(selectedClass);
                      }catch(err){alert('Error');}
                    }} className="space-y-4">
                      <div><label className="block text-sm font-medium mb-1">School</label><select className={inputCls} value={sentForm.school_id} onChange={e=>setSentForm({...sentForm,school_id:e.target.value})}><option value="">Select</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
                      <div><label className="block text-sm font-medium mb-1">Correct Sentence</label><input required className={inputCls} value={sentForm.correct_sentence} onChange={e=>setSentForm({...sentForm,correct_sentence:e.target.value})} placeholder="e.g. The cat sat on the mat" /></div>
                      <div className="flex justify-between items-center"><label className="block text-sm font-medium">Words — auto-matches sentence length</label><button type="button" onClick={autoFillWords} className="text-indigo-600 text-sm font-bold">⚡ Auto-fill & Shuffle</button></div>
                      <div className="grid grid-cols-2 gap-2">{sentForm.words.map((w,i)=><div key={i} className="flex gap-1"><input className={inputCls} value={w} onChange={e=>{const ws=[...sentForm.words];ws[i]=e.target.value;setSentForm({...sentForm,words:ws})}} placeholder={`Word ${i+1}`} /><button type="button" onClick={()=>removeWordSlot(i)} className="text-red-400 hover:text-red-600 px-1">×</button></div>)}</div>
                      <button type="button" onClick={addWordSlot} className="text-indigo-600 text-sm font-bold">+ Add Word Slot</button>
                      <div><button type="submit" className={btnCls} disabled={(dataCounts['sentence']||0)>=5}>Add Sentence Exercise</button></div>
                    </form>
                  </div>
                )}
                {/* Data listing */}
                <hr className="my-6"/>
                <h4 className="font-bold text-slate-700 mb-3">Existing {dataTab} entries for Class {selectedClass} ({dataTab==='sentence'?sentExercises.filter(s=>s.class_name===selectedClass).length:dataList.length})</h4>
                {dataTab!=='sentence' && dataList.length===0 && <p className="text-slate-400 text-sm">No entries yet.</p>}
                {dataTab==='vocab' && dataList.map(d=><div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div><span className="font-bold text-slate-800 text-sm">{d.word}</span><span className="ml-2 text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded capitalize">{d.type}</span><span className="ml-2 text-xs text-slate-500">{d.meaning}</span></div><button onClick={()=>deleteDataItem('vocab',d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>)}
                {dataTab==='grammar' && dataList.map(d=><div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div><span className="font-bold text-slate-800 text-sm">{d.topic||'—'}</span><span className="ml-2 text-xs text-slate-500">{d.question_text}</span></div><button onClick={()=>deleteDataItem('grammar',d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>)}
                {dataTab==='syllabus' && dataList.map(d=><div key={d.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div><span className="font-bold text-slate-800 text-sm">{d.subject}</span><span className="ml-2 text-xs text-slate-500">{d.lesson_title}</span></div><button onClick={()=>deleteDataItem('syllabus',d.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>)}
                {dataTab==='sentence' && sentExercises.filter(s=>s.class_name===selectedClass).map(s=>{let words=[]; try{words=JSON.parse(s.words_json)}catch(e){} return <div key={s.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl mb-2 border border-slate-100"><div><span className="font-bold text-slate-800 text-sm">{s.correct_sentence}</span><span className="ml-2 text-xs text-slate-400">[{words.join(', ')}]</span></div><button onClick={()=>handleDeleteSent(s.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>})}
                {dataTab==='sentence' && sentExercises.filter(s=>s.class_name===selectedClass).length===0 && <p className="text-slate-400 text-sm">No sentence exercises yet.</p>}
                </div>)}
              </div>
            )}
          </div>
        )}

        {activeTab==='tests' && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Create MCQ Test</h3>
            <form onSubmit={handleTestSubmit} className="space-y-4 max-w-xl mb-8">
              <div><label className="block text-sm font-medium mb-1">Test Title</label><input required className={inputCls} value={testForm.title} onChange={e=>setTestForm({...testForm,title:e.target.value})} /></div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="block text-sm font-medium mb-1">Class</label><select required className={inputCls} value={testForm.class_name} onChange={e=>setTestForm({...testForm,class_name:e.target.value})}><option value="">Select</option>{Array.from({length:10},(_,i)=>i+1).map(c=><option key={c} value={String(c)}>Class {c}</option>)}</select></div>
                <div className="flex-1"><label className="block text-sm font-medium mb-1">Section (optional)</label><input className={inputCls} value={testForm.section_name} onChange={e=>setTestForm({...testForm,section_name:e.target.value})} placeholder="e.g. A, B, C" /></div>
              </div>
              <hr/><h4 className="font-bold">Questions</h4>
              {testForm.questions.map((tq,qi)=>(
                <div key={qi} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <p className="font-bold text-sm text-slate-500">Q{qi+1}</p>
                  <input required placeholder="Question" className={inputCls} value={tq.q} onChange={e=>{const qs=[...testForm.questions];qs[qi].q=e.target.value;setTestForm({...testForm,questions:qs})}} />
                  {tq.opts.map((o,oi)=><input key={oi} required placeholder={`Option ${oi+1}`} className={inputCls} value={o} onChange={e=>{const qs=[...testForm.questions];qs[qi].opts[oi]=e.target.value;setTestForm({...testForm,questions:qs})}} />)}
                  <input type="number" min="0" max="3" required placeholder="Correct Index (0-3)" className={inputCls} value={tq.ans} onChange={e=>{const qs=[...testForm.questions];qs[qi].ans=parseInt(e.target.value);setTestForm({...testForm,questions:qs})}} />
                </div>
              ))}
              <button type="button" onClick={addTestQuestion} className="text-indigo-600 font-bold text-sm">+ Add Another Question</button>
              <div><button type="submit" className={btnCls}>Publish Test</button></div>
            </form>
            <hr className="my-6"/>
            <h4 className="font-bold text-slate-800 mb-4">Published Tests</h4>
            {tests.map(t=><div key={t.id} className="p-3 bg-slate-50 rounded-xl mb-2 flex justify-between items-center"><div><span className="font-bold text-slate-700">{t.title}</span><span className="text-sm text-slate-500 ml-2">Class {t.class_name} {t.section_name?`- ${t.section_name}`:''}</span></div><button onClick={()=>deleteTest(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button></div>)}
            {tests.length===0 && <p className="text-slate-500 text-sm">No tests created yet.</p>}
          </div>
        )}

        {activeTab==='notif' && (
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
            <h3 className="text-xl font-bold text-slate-800 mb-6">Notifications</h3>
            {/* Send form */}
            <form onSubmit={async(e)=>{e.preventDefault();const msg=e.target.message.value;const role=e.target.role.value;const sid=e.target.school_id.value;try{await axios.post('/api/notifications',{message:msg,target_role:role||null,school_id:sid||null},{headers:headers()});alert('Notification sent!');e.target.reset();fetchData();}catch(err){alert('Error sending notification');}}} className="space-y-4 max-w-xl mb-8">
              <div><label className="block text-sm font-medium mb-1">Message</label><textarea required name="message" className={inputCls} rows={2} placeholder="Enter notification message..."/></div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="block text-sm font-medium mb-1">Target Role (optional)</label><select name="role" className={inputCls}><option value="">All Roles</option><option value="STUDENT">Students</option><option value="STAFF">Staff</option><option value="PRINCIPAL">Principals</option><option value="PARENT">Parents</option></select></div>
                <div className="flex-1"><label className="block text-sm font-medium mb-1">School (optional)</label><select name="school_id" className={inputCls}><option value="">All Schools</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              </div>
              <button type="submit" className={btnCls}>Send Notification</button>
            </form>
            <hr className="my-6"/>
            <h4 className="font-bold text-slate-700 mb-3">Recent Notifications</h4>
            {notifications.map((n,i)=><div key={i} className="p-4 border-b border-slate-100 last:border-0"><p className="text-slate-700 font-medium">{n.message}</p><p className="text-xs text-slate-400 mt-1">{new Date(n.created_at).toLocaleString()}</p></div>)}
            {notifications.length===0 && <p className="text-slate-500">No notifications yet.</p>}
          </div>
        )}




      {showSchoolModal && (<div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold">Add School</h3><button onClick={()=>setShowSchoolModal(false)}><X size={20}/></button></div><form onSubmit={handleAddSchool} className="space-y-4"><div><label className="block text-sm font-medium mb-1">School Name</label><input required className={inputCls} value={schoolForm.name} onChange={e=>setSchoolForm({...schoolForm,name:e.target.value})} /></div><div><label className="block text-sm font-medium mb-1">Address</label><input className={inputCls} value={schoolForm.address} onChange={e=>setSchoolForm({...schoolForm,address:e.target.value})} /></div><button type="submit" className={btnCls+" w-full"}>Create School</button></form></div></div>)}

      {showUserModal && (<div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50 overflow-y-auto"><div className="bg-white rounded-2xl p-6 w-full max-w-md my-8"><div className="flex justify-between items-center mb-4"><h3 className="text-xl font-bold">Add User</h3><button onClick={()=>setShowUserModal(false)}><X size={20}/></button></div><form onSubmit={handleAddUser} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Username</label><input required className={inputCls} value={userForm.username} onChange={e=>setUserForm({...userForm,username:e.target.value})} /></div>
        <div><label className="block text-sm font-medium mb-1">Password</label><input required type="password" className={inputCls} value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})} /></div>
        <div><label className="block text-sm font-medium mb-1">Role</label><select className={inputCls} value={userForm.role} onChange={e=>setUserForm({...userForm,role:e.target.value})}><option value="STUDENT">Student</option><option value="STAFF">Staff</option><option value="PRINCIPAL">Principal</option><option value="PARENT">Parent</option><option value="ADMIN">Admin</option></select></div>
        <div><label className="block text-sm font-medium mb-1">School</label><select className={inputCls} value={userForm.school_id} onChange={e=>setUserForm({...userForm,school_id:e.target.value})}><option value="">Select School...</option>{schools.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="flex gap-4"><div className="flex-1"><label className="block text-sm font-medium mb-1">Class</label><select required={['STUDENT', 'STAFF'].includes(userForm.role)} className={inputCls} value={userForm.class_name} onChange={e=>setUserForm({...userForm,class_name:e.target.value})}><option value="">Select</option>{Array.from({length:10},(_,i)=>i+1).map(c=><option key={c} value={String(c)}>{c}</option>)}</select></div><div className="flex-1"><label className="block text-sm font-medium mb-1">Section</label><input required={['STUDENT', 'STAFF'].includes(userForm.role)} className={inputCls} value={userForm.section_name} onChange={e=>setUserForm({...userForm,section_name:e.target.value})} placeholder="e.g. A" /></div></div>
        {userForm.role==='STUDENT'&&<div><label className="block text-sm font-medium mb-1">USN (Unique Student Number)</label><input required className={inputCls} value={userForm.usn} onChange={e=>setUserForm({...userForm,usn:e.target.value})} placeholder="e.g. STU2024001" /></div>}
        {userForm.role==='STAFF'&&<div className="bg-blue-50 rounded-xl p-3 text-xs text-blue-700">Staff will be assigned to the selected Class &amp; Section above. Students in that class/section will appear in their dashboard.</div>}
        {userForm.role==='PARENT'&&<div><label className="block text-sm font-medium mb-1">Link to Student (Select Section First)</label>
          <select className={inputCls} value={userForm.mapped_student_id} onChange={e=>setUserForm({...userForm,mapped_student_id:e.target.value})}>
            <option value="">Select Student...</option>
            {users.filter(u=>u.role==='STUDENT'&&(!userForm.school_id||String(u.school_id)===String(userForm.school_id))).map(u=><option key={u.id} value={u.id}>{u.username}{u.usn?` (${u.usn})`:''} — Class {u.class_name||'?'}{u.section_name?`-${u.section_name}`:''}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1">Select the student this parent is linked to. Filter by school first for better results.</p>
        </div>}
        <button type="submit" className={btnCls+" w-full"}>Create User</button>
      </form></div></div>)}
    </DashboardLayout>
  );
}
