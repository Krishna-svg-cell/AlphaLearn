'use client';
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { Flame, Star, BookOpen, PenTool, CheckCircle, Award, ArrowRight, TrendingUp, LogOut, X, BarChart2, RotateCcw, Bell, Zap, MessageCircle, Send, Calendar, User, Mic, Volume2, Bot, MicOff, Sparkles, Trash2, StopCircle } from 'lucide-react';
import DashboardLayout from '../components/DashboardLayout';
import UserLevelBar from '../components/UserLevelBar';
import LearningPath from '../components/LearningPath';
import { motion, AnimatePresence } from 'framer-motion';

import { loadClassContent, generateDailyMission, getLocalDateString, getPracticeQuestions, getDailyPracticeQuestions } from '../lib/contentEngine';

export default function StudentDashboard() {
  const [user, setUser] = useState(null);
  const [mission, setMission] = useState(null);
  const [error, setError] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [missionStartTime, setMissionStartTime] = useState(null);
  const [currentSection, setCurrentSection] = useState('meaning');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState({ meaning:0, synonym:0, antonym:0, grammar:0, syllabus:0, sentence:0 });
  const [sentenceAnswer, setSentenceAnswer] = useState([]);
  const [sentenceFb, setSentenceFb] = useState(null);
  const [allAnswers, setAllAnswers] = useState([]);
  const [activeView, setActiveView] = useState('mission');
  const [feedback, setFeedback] = useState(null); // {selected, correct}
  const [showingContent, setShowingContent] = useState(false); // show grammar/syllabus content before MCQ
  const [currentTheme, setCurrentTheme] = useState('light');
  const [showPracticeModal, setShowPracticeModal] = useState(false);
  const [practiceQs, setPracticeQs] = useState([]);
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [practiceFb, setPracticeFb] = useState(null);

  // Subject module
  const [studentSubjects, setStudentSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [subjectChapters, setSubjectChapters] = useState([]);
  const [subjectQuiz, setSubjectQuiz] = useState(null);
  const [subjectQuizIdx, setSubjectQuizIdx] = useState(0);
  const [subjectQuizAnswers, setSubjectQuizAnswers] = useState([]);
  const [subjectQuizFb, setSubjectQuizFb] = useState(null);
  const [subjectQuizResult, setSubjectQuizResult] = useState(null);
  const [subjectProgress, setSubjectProgress] = useState([]);
  const [readingChapter, setReadingChapter] = useState(null);

  const safeDate = (dateStr) => {
    if (!dateStr) return new Date();
    if (typeof dateStr === 'string' && dateStr.includes(' ') && !dateStr.includes('T')) {
      // Legacy timestamps were stored in IST (Asia/Kolkata) format: "YYYY-MM-DD HH:MM:SS"
      return new Date(dateStr.replace(' ', 'T') + '+05:30');
    }
    return new Date(dateStr);
  };
  const [showBadgesModal, setShowBadgesModal] = useState(false);
  const [badges, setBadges] = useState([]);
  const [history, setHistory] = useState([]);
  const [dayDetail, setDayDetail] = useState(null);
  const [dayAnswers, setDayAnswers] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [reviewDetail, setReviewDetail] = useState(null);
  const [reviewAnswers, setReviewAnswers] = useState([]);
  const [shuffledWords, setShuffledWords] = useState([]);
  const [tests, setTests] = useState([]);
  const [activeTest, setActiveTest] = useState(null);
  const [testIdx, setTestIdx] = useState(0);
  const [testFb, setTestFb] = useState(null);
  const [testScore, setTestScore] = useState(0);
  const [testAnswers, setTestAnswers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [missionResult, setMissionResult] = useState(null);
  const [progressStats, setProgressStats] = useState(null);
  const [localContent, setLocalContent] = useState(null); // Local-first: cached class content
  const [testResults, setTestResults] = useState([]);
  const [submittedTestIds, setSubmittedTestIds] = useState([]);
  const [sentencePractice, setSentencePractice] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [attendanceStats, setAttendanceStats] = useState({ present: 0, absent: 0, late: 0 });

  // AI Tutor state
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSessionId, setAiSessionId] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [showAiTutor, setShowAiTutor] = useState(false);

  // Voice Tutor state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [recognitionSupported, setRecognitionSupported] = useState(false);
  const recognitionRef = useRef(null);
  const synthRef = useRef(null);
  const aiChatEndRef = useRef(null);

  // Smart Learning state
  const [srsData, setSrsData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);
  const [adaptiveData, setAdaptiveData] = useState(null);
  const [srsQuizActive, setSrsQuizActive] = useState(false);
  const [srsIndex, setSrsIndex] = useState(0);
  const [srsFeedback, setSrsFeedback] = useState(null);
  const [srsScore, setSrsScore] = useState(0);
  
  const router = useRouter();

  // ==================== VOICE / SPEECH SETUP ====================
  useEffect(() => {
    // Check Speech Synthesis support
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      setSpeechSupported(true);
      synthRef.current = window.speechSynthesis;
    }
    // Check Speech Recognition support
    const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    if (SpeechRecognition) {
      setRecognitionSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setAiInput(prev => prev ? prev + ' ' + transcript : transcript);
        setIsListening(false);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);
      recognitionRef.current = recognition;
    }
    return () => {
      if (synthRef.current) synthRef.current.cancel();
      if (recognitionRef.current) try { recognitionRef.current.abort(); } catch(e) {}
    };
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.abort();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch(e) { setIsListening(false); }
    }
  };

  const speakText = (text) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/[*#_`]/g, '').substring(0, 1000));
    utterance.lang = 'en-IN';
    utterance.rate = 0.9;
    utterance.pitch = 1.05;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  // ==================== AI TUTOR FUNCTIONS ====================
  const sendAiMessage = async (e) => {
    if (e) e.preventDefault();
    if (!aiInput.trim() || aiLoading) return;
    const msg = aiInput.trim();
    setAiInput('');
    setAiError(null);
    setAiMessages(prev => [...prev, { role: 'user', content: msg, created_at: new Date().toISOString() }]);
    setAiLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post('/api/student/ai-tutor', 
        { message: msg, session_id: aiSessionId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!aiSessionId) setAiSessionId(res.data.session_id);
      setAiMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, created_at: new Date().toISOString() }]);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to get response. Please try again.';
      setAiError(errMsg);
      setAiMessages(prev => [...prev, { role: 'assistant', content: errMsg, created_at: new Date().toISOString(), isError: true }]);
    } finally {
      setAiLoading(false);
    }
  };

  const clearAiSession = async () => {
    if (aiSessionId) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`/api/student/ai-tutor/session?session_id=${aiSessionId}`, { headers: { Authorization: `Bearer ${token}` } });
      } catch(e) {}
    }
    setAiMessages([]);
    setAiSessionId(null);
    setAiError(null);
  };

  // Auto-scroll AI chat
  useEffect(() => {
    if (aiChatEndRef.current) aiChatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [aiMessages, aiLoading]);


  // Resilient API fetcher — retries on 500/network errors (Neon cold-start recovery)
  const fetchWithRetry = async (url, headers, retries = 3) => {
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.get(url, { headers });
        return res;
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

    // LOCAL-FIRST: Load user from server, content from device
    const loadDashboard = async () => {
      let userData = null;
      try {
        const userRes = await fetchWithRetry('/api/auth/me', h);
        userData = userRes.data;
        setUser(userData);
      } catch (err) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.clear(); window.location.href = '/';
          return;
        }
        setError('Failed to load user. Database connection may have dropped.');
        return;
      }

      // LOCAL-FIRST: Load content from device cache, generate mission client-side
      try {
        const className = userData.class_name || '1';
        const content = await loadClassContent(className);
        setLocalContent(content);

        const dateStr = getLocalDateString();
        const localMission = generateDailyMission(content, dateStr);

        // Check completion status from server (lightweight query)
        let status = { is_completed: false };
        try {
          const statusRes = await fetchWithRetry('/api/daily-mission/status', h);
          status = statusRes.data;
        } catch (e) {
          // If server unreachable, check local storage for today's completion
          const localStatus = localStorage.getItem(`al_mission_${dateStr}`);
          if (localStatus) status = JSON.parse(localStatus);
        }

        // If completed, try to load stored answers for review
        if (status.is_completed) {
          try {
            const answersRes = await axios.get(`/api/student/history/${dateStr}`, { headers: h });
            if (answersRes.data && answersRes.data.length > 0) {
              // Reconstruct mission from stored answers for review
              const m = { meaning: [], synonym: [], antonym: [], grammar: [], syllabus: [], sentences: [] };
              answersRes.data.forEach(a => {
                let opts = [];
                try { opts = a.options_json ? JSON.parse(a.options_json) : []; } catch(e) {}
                if (['meaning', 'synonym', 'antonym'].includes(a.section)) {
                  m[a.section].push({ word: a.question_text, correctIndex: parseInt(a.correct_index) || 0, options: opts });
                } else if (a.section === 'grammar') {
                  m.grammar.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, topic: 'Review', explanation: 'Historical review.' });
                } else if (a.section === 'syllabus') {
                  m.syllabus.push({ q: a.question_text, ans: parseInt(a.correct_index) || 0, opts: opts, lesson_title: 'Review', content: 'Historical review.' });
                } else if (a.section === 'sentence') {
                  const words = (a.correct_index || a.question_text || '').split(' ').filter(w=>w.trim());
                  m.sentences.push({ correct_sentence: a.correct_index || a.question_text, words: words });
                }
              });
              setMission({ status, hasContent: answersRes.data.length > 0, totalQuestions: answersRes.data.length, mission: m });
            } else {
              setMission({ status, ...localMission });
            }
          } catch(e) {
            setMission({ status, ...localMission });
          }
        } else {
          setMission({ status, ...localMission });
        }
      } catch (err) {
        console.error('[LOCAL-FIRST] Content load failed:', err);
        setMission({ status: { is_completed: false }, hasContent: false, totalQuestions: 0, mission: { meaning: [], synonym: [], antonym: [], grammar: [], syllabus: [], sentences: [] } });
      }

      // Non-critical data — fire and forget (still from server)
      axios.get('/api/leaderboard', { headers: h }).then(r => setLeaderboard(r.data)).catch(()=>{});
      axios.get('/api/notifications', { headers: h }).then(r => setNotifications(r.data)).catch(()=>{});
      axios.get('/api/student/tests', { headers: h }).then(r => setTests(r.data)).catch(()=>{});
      axios.get('/api/student/test-results', { headers: h }).then(r => { setTestResults(r.data); setSubmittedTestIds(r.data.map(t=>t.test_id)); }).catch(()=>{});
      axios.get('/api/student/history', { headers: h }).then(r => setHistory(r.data)).catch(()=>{});
      axios.get('/api/student/progress-stats', { headers: h }).then(r => setProgressStats(r.data)).catch(()=>{});
      // Smart Learning features
      axios.get('/api/student/srs-review', { headers: h }).then(r => setSrsData(r.data)).catch(()=>{});
      axios.get('/api/student/weakness-heatmap', { headers: h }).then(r => setHeatmapData(r.data)).catch(()=>{});
      axios.get('/api/student/adaptive-difficulty', { headers: h }).then(r => setAdaptiveData(r.data)).catch(()=>{});
    };
    loadDashboard();
  }, [router]);

  useEffect(() => {
      if (activeView === 'messages') {
          const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
          axios.get('/api/communication/messages', { headers: h }).then(res => {
              setMessages(res.data);
              axios.put('/api/communication/messages/read', {}, { headers: h }).catch(()=>{});
          }).catch(()=>{});
      }
  }, [activeView]);

  const sendMessage = async (e) => {
      e.preventDefault();
      if (!newMessage.trim()) return;
      try {
          const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
          await axios.post('/api/communication/messages', { message: newMessage }, { headers: h });
          setMessages(prev => [...prev, { sender_id: user.id, sender_role: 'STUDENT', message: newMessage, created_at: new Date().toISOString() }]);
          setNewMessage('');
      } catch(e) { alert(e.response?.data?.error || 'Failed to send message'); }
  };

  const fetchExtra = (view) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    if (view === 'track') {
      axios.get('/api/student/history', { headers: h }).then(r => setHistory(r.data)).catch(()=>{});
      axios.get('/api/student/progress-stats', { headers: h }).then(r => setProgressStats(r.data)).catch(()=>{});
      axios.get('/api/student/test-results', { headers: h }).then(r => setTestResults(r.data)).catch(()=>{});
      axios.get('/api/student/weakness-heatmap', { headers: h }).then(r => setHeatmapData(r.data)).catch(()=>{});
      axios.get('/api/student/adaptive-difficulty', { headers: h }).then(r => setAdaptiveData(r.data)).catch(()=>{});
    }
    if (view === 'practice') axios.get('/api/student/tests', { headers: h }).then(r => setTests(r.data)).catch(()=>{});
  };

  const switchView = (v) => {
    if (v === 'review') {
      fetchReview().catch(() => {});
      setActiveView('review');
      return;
    }
    if (v === 'badges') {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      axios.get('/api/student/badges', { headers: h }).then(r => { setBadges(r.data); setShowBadgesModal(true); }).catch(() => {});
      return;
    }
    if (v === 'subjects') {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      axios.get('/api/student/subjects', { headers: h }).then(r => setStudentSubjects(r.data)).catch(()=>{});
      axios.get('/api/student/subject-progress', { headers: h }).then(r => setSubjectProgress(r.data)).catch(()=>{});
      setSelectedSubject(null); setSubjectQuiz(null); setSubjectQuizResult(null);
    }
    setActiveView(v);
    fetchExtra(v);
  };

  const handleAnswer = (selIdx) => {
    const list = mission.mission[currentSection];
    const q = list[currentIndex];
    const correctIdx = Number(['meaning','synonym','antonym'].includes(currentSection) ? q.correctIndex : q.ans);
    const selNum = Number(selIdx);
    const isCorrect = selNum === correctIdx;
    setFeedback({ selected: selNum, correct: correctIdx });
    if (isCorrect) setScore(s => ({ ...s, [currentSection]: s[currentSection] + 10 }));
    const qText = ['meaning','synonym','antonym'].includes(currentSection) ? q.word : q.q;
    const opts = q.options || q.opts || [];
    setAllAnswers(prev => [...prev, { section: currentSection, question_text: qText, selected_index: selNum, correct_index: correctIdx, is_correct: isCorrect, options: opts }]);
    setTimeout(() => {
      setFeedback(null);
      if (currentIndex < list.length - 1) {
        setCurrentIndex(currentIndex + 1);
        if (['grammar','syllabus'].includes(currentSection)) setShowingContent(true);
      } else {
        goToNextSection(currentSection);
      }
    }, 1200);
  };

  const goToNextSection = (currentSec) => {
    const order = ['meaning', 'synonym', 'antonym', 'grammar', 'syllabus', 'sentence'];
    let nextIdx = order.indexOf(currentSec) + 1;
    
    while (nextIdx < order.length) {
      const sec = order[nextIdx];
      const list = sec === 'sentence' ? (mission?.mission?.sentences || []) : (mission?.mission?.[sec] || []);
      if (list && list.length > 0) {
        setCurrentSection(sec);
        setCurrentIndex(0);
        if (['grammar', 'syllabus'].includes(sec)) setShowingContent(true);
        if (sec === 'sentence') { setSentenceAnswer([]); setSentenceFb(null); }
        return;
      }
      nextIdx++;
    }
    finishMission();
  };

  const startMissionFlow = () => {
    setPlaying(true);
    setMissionStartTime(new Date().toISOString());
    setScore({meaning:0,synonym:0,antonym:0,grammar:0,syllabus:0,sentence:0});
    setAllAnswers([]);
    setSentenceAnswer([]);
    setSentenceFb(null);
    setShowingContent(false);
    
    // Find first non-empty section
    const order = ['meaning', 'synonym', 'antonym', 'grammar', 'syllabus', 'sentence'];
    for (const sec of order) {
      const list = sec === 'sentence' ? (mission?.mission?.sentences || []) : (mission?.mission?.[sec] || []);
      if (list && list.length > 0) {
        setCurrentSection(sec);
        setCurrentIndex(0);
        if (['grammar', 'syllabus'].includes(sec)) setShowingContent(true);
        return;
      }
    }
    // If all empty, just finish
    finishMission();
  };

  const [isReplay, setIsReplay] = useState(false);

  const finishMission = async () => {
    try {
      if (isReplay) {
        setMissionResult({ xpEarned: 0, streak: user?.streak || 0, score });
        setPlaying(false);
        setActiveView('result');
        setIsReplay(false);
        return;
      }
      const token = localStorage.getItem('token');
      const duration = missionStartTime ? Math.floor((Date.now() - new Date(missionStartTime).getTime()) / 1000) : 0;
      const res = await axios.post('/api/daily-mission/submit', { 
        vocab_score: score.meaning + score.synonym + score.antonym, 
        grammar_score: score.grammar, 
        syllabus_score: score.syllabus, 
        sentence_score: score.sentence, 
        answers: allAnswers,
        start_time: missionStartTime,
        duration
      }, { headers: { Authorization: `Bearer ${token}` } });
      setMissionResult({ xpEarned: res.data.xpEarned, streak: res.data.streak, score });
      if (user) setUser({ ...user, xp: (user.xp || 0) + res.data.xpEarned, streak: res.data.streak });
      
      // LOCAL-FIRST: Cache completion status locally for offline awareness
      try {
        const dateStr = getLocalDateString();
        localStorage.setItem(`al_mission_${dateStr}`, JSON.stringify({ is_completed: true }));
      } catch(e) { /* ignore */ }

      // Instantly sync dashboard analytics
      axios.get('/api/student/progress-stats', { headers: { Authorization: `Bearer ${token}` } }).then(r => setProgressStats(r.data)).catch(()=>{});
      fetchReview();
      
      setPlaying(false);
      setActiveView('result');
    } catch (err) { alert(err.response?.data?.error || 'Error submitting mission. Please try again.'); }
  };

  // LOCAL-FIRST: Practice loads the EXACT same questions from today's Daily Mission
  // We call generateDailyMission() and extract the specific category from it
  const startPractice = async (type) => {
    if (!localContent) return alert('Content not loaded yet. Please wait...');
    const todayStr = getLocalDateString();
    const todayMission = generateDailyMission(localContent, todayStr);
    
    // Map practice type to the mission's section key
    const sectionMap = {
      meaning: 'meaning', synonym: 'synonym', antonym: 'antonym',
      grammar: 'grammar', syllabus: 'syllabus'
    };
    const sectionKey = sectionMap[type];
    if (!sectionKey) return;
    
    const missionItems = todayMission.mission[sectionKey] || [];
    if (!missionItems.length) return alert('No content available for this category today.');
    
    // Convert mission items to practice format (q, opts, ans)
    const questions = missionItems.map(item => {
      if (['meaning', 'synonym', 'antonym'].includes(type)) {
        const prefix = type === 'meaning' ? 'Meaning of' : type === 'synonym' ? 'Synonym of' : 'Antonym of';
        return { q: `${prefix}: ${item.word}`, opts: item.options, ans: item.correctIndex };
      }
      // grammar & syllabus already have q, opts, ans
      return { q: item.q, opts: item.opts, ans: item.ans };
    });
    
    console.log(`[Practice] 📅 ${todayStr} | ${type} | ${questions.length} questions (EXACT match with today's mission)`);
    setPracticeQs(questions); setPracticeIdx(0); setPracticeFb(null); setShowPracticeModal(true);
  };

  const handlePracticeAns = (sel) => {
    const correct = Number(practiceQs[practiceIdx].ans);
    const selNum = Number(sel);
    setPracticeFb({ selected: selNum, correct });
    setTimeout(() => { setPracticeFb(null); if (practiceIdx < practiceQs.length - 1) setPracticeIdx(practiceIdx + 1); else { setShowPracticeModal(false); alert('Practice complete!'); } }, 1200);
  };

  // LOCAL-FIRST: Sentence practice — EXACT same sentences from today's mission
  const startSentencePractice = async () => {
    if (!localContent) return alert('Content not loaded yet. Please wait...');
    const todayStr = getLocalDateString();
    const todayMission = generateDailyMission(localContent, todayStr);
    const sentences = todayMission.mission.sentences || [];
    if (!sentences.length) return alert('No sentence exercises in today\'s mission.');
    // Pre-shuffle words for each item so they don't re-shuffle on render
    const items = sentences.map(item => ({
      ...item,
      shuffledWords: item.words.slice().sort(() => 0.5 - Math.random())
    }));
    setSentencePractice({ items, idx: 0, answer: [], fb: null });
  };

  const loadTest = async (id) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const res = await axios.get(`/api/student/tests/${id}`, { headers: h });
    setActiveTest(res.data); setTestIdx(0); setTestFb(null); setTestScore(0); setTestAnswers([]);
  };

  const handleTestAns = (sel) => {
    const q = activeTest.questions[testIdx];
    const correct = Number(q.ans);
    const selNum = Number(sel);
    setTestFb({ selected: selNum, correct });
    const isCorrect = selNum === correct;
    if (isCorrect) setTestScore(s => s + 1);
    setTestAnswers(prev => [...prev, { q: q.q, selected: selNum, correct, is_correct: isCorrect }]);
    setTimeout(() => {
      setTestFb(null);
      if (testIdx < activeTest.questions.length - 1) setTestIdx(testIdx + 1);
      else submitTest(testScore + (isCorrect ? 1 : 0));
    }, 1200);
  };

  const submitTest = async (finalScore) => {
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const total = activeTest.questions.length;
      await axios.post(`/api/student/tests/${activeTest.id}/submit`, { score: finalScore, total, answers: testAnswers }, { headers: h });
      setMissionResult({ xpEarned: finalScore * 5, streak: null, score: { test: finalScore, total } });
      if (user) setUser({ ...user, xp: (user.xp || 0) + (finalScore * 5) });
      setActiveTest(null);
      setActiveView('testResult');
      setSubmittedTestIds(prev => [...prev, activeTest.id]);
    } catch(err) { alert(err.response?.data?.error || 'Error submitting test'); setActiveTest(null); }
  };

  const viewDay = async (date) => {
    const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
    const res = await axios.get(`/api/student/history/${date}`, { headers: h });
    setDayDetail(date); setDayAnswers(res.data);
  };

  const fetchReview = async () => {
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get('/api/student/review', { headers: h });
      setReviewItems(res.data);
      setReviewDetail(null);
      setReviewAnswers([]);
    } catch(err) {
      console.warn('Failed to fetch review:', err);
      setReviewItems([]);
      setReviewDetail(null);
      setReviewAnswers([]);
    }
  };

  const startReplay = async () => {
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get(`/api/student/review/${reviewDetail}/mission`, { headers: h });
      setMission(res.data);
      setIsReplay(true);
      setScore({ meaning: 0, synonym: 0, antonym: 0, grammar: 0, syllabus: 0, sentence: 0 });
      setAllAnswers([]);
      setPlaying(true);
      setActiveView('mission');
      
      const order = ['meaning', 'synonym', 'antonym', 'grammar', 'syllabus', 'sentence'];
      for (const sec of order) {
        const list = sec === 'sentence' ? (res.data?.mission?.sentences || []) : (res.data?.mission?.[sec] || []);
        if (list && list.length > 0) {
          setCurrentSection(sec);
          setCurrentIndex(0);
          setShowingContent(['grammar', 'syllabus'].includes(sec));
          return;
        }
      }
      finishMission();
    } catch(err) {
      console.warn('Failed to start replay:', err);
      alert('Unable to replay this mission. The exact questions are no longer available.');
    }
  };

  const openReviewDetail = async (date) => {
    setReviewDetail(date);
    try {
      const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
      const res = await axios.get(`/api/student/review/${date}`, { headers: h });
      setReviewAnswers(res.data);
    } catch(err) {
      console.warn('Failed to fetch review detail:', err);
      setReviewAnswers([]);
    }
  };

  const optBtnCls = (i, fb) => {
    if (!fb) return 'quiz-option';
    if (i === fb.correct) return 'quiz-option correct';
    if (i === fb.selected && i !== fb.correct) return 'quiz-option wrong';
    return 'quiz-option faded';
  };



  // TEST RESULT SCREEN
  if (activeView === 'testResult' && missionResult) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-3xl p-8 text-white text-center mb-4 shadow-xl">
            <div className="text-6xl mb-4">📝</div>
            <h1 className="text-2xl font-bold mb-1">Test Complete!</h1>
            <p className="text-emerald-200 mb-4">Score: {missionResult.score.test}/{missionResult.score.total}</p>
            <div className="bg-white/10 rounded-2xl p-4 border border-white/20 inline-block"><Zap className="text-yellow-300 mx-auto mb-1" size={24}/><p className="text-xl font-bold">+{missionResult.xpEarned} XP</p></div>
          </div>
          <button onClick={() => { setMissionResult(null); setActiveView('mission'); window.location.reload(); }} className="w-full gradient-btn py-4 rounded-2xl font-bold text-lg text-white">Continue</button>
        </div>
      </div>
    );
  }

  // MISSION COMPLETE SCREEN
  if (activeView === 'result' && missionResult) {
    const { xpEarned, streak, score: s } = missionResult;
    const categories = [
      { label: 'Words', value: s.meaning, icon: '📚', color: 'bg-indigo-50 text-indigo-700' },
      { label: 'Synonyms', value: s.synonym, icon: '🔗', color: 'bg-emerald-50 text-emerald-700' },
      { label: 'Antonyms', value: s.antonym, icon: '🔄', color: 'bg-pink-50 text-pink-700' },
      { label: 'Grammar', value: s.grammar, icon: '✏️', color: 'bg-amber-50 text-amber-700' },
      { label: 'Syllabus', value: s.syllabus, icon: '📖', color: 'bg-teal-50 text-teal-700' },
      { label: 'Sentence', value: s.sentence, icon: '🔤', color: 'bg-purple-50 text-purple-700' },
    ];
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", damping: 15 }}
          className="max-w-sm w-full"
        >
          <div className="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-3xl p-8 text-white text-center mb-4 relative overflow-hidden shadow-xl">

            <div className="absolute top-0 left-0 right-0 bottom-0 opacity-10" style={{background:'radial-gradient(circle at 70% 20%, white 0%, transparent 60%)'}} />
            <div className="text-6xl mb-4">🎉</div>
            <h1 className="text-2xl font-bold mb-1">Mission Complete!</h1>
            <p className="text-indigo-200 mb-6">Great work today!</p>
            <div className="flex justify-center gap-6">
              <div className="bg-white/10 rounded-2xl p-4 border border-white/20">
                <Zap className="text-yellow-300 mx-auto mb-1" size={24}/>
                <p className="text-2xl font-bold">+{xpEarned}</p>
                <p className="text-xs text-indigo-200">XP Earned</p>
              </div>
              <div className="bg-white/10 rounded-2xl p-4 border border-white/20">
                <Flame className="text-orange-300 mx-auto mb-1" size={24}/>
                <p className="text-2xl font-bold">{streak}</p>
                <p className="text-xs text-indigo-200">Day Streak</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-4">
            <h3 className="font-bold text-slate-800 mb-4 text-center">Score Breakdown</h3>
            <div className="grid grid-cols-3 gap-3">
              {categories.map(c => (
                <div key={c.label} className={`${c.color} rounded-2xl p-4 text-center`}>
                  <div className="text-2xl mb-1">{c.icon}</div>
                  <p className="font-bold text-xl">{c.value}</p>
                  <p className="text-xs font-medium opacity-75">{c.label}</p>
                </div>
              ))}
            </div>
          </div>
          <button onClick={() => window.location.reload()} className="w-full gradient-btn py-4 rounded-2xl font-bold text-lg text-white text-center">
            Continue Learning
          </button>
        </motion.div>
      </div>
    );

  }

  // PLAYING DAILY MISSION — CONTENT READING SCREEN (Grammar & Syllabus)
  if (playing && showingContent && ['grammar','syllabus'].includes(currentSection)) {
    const list = mission.mission[currentSection];
    if (!list || list.length === 0) { setShowingContent(false); return null; }
    const q = list[currentIndex];
    const isGrammar = currentSection === 'grammar';
    const topic = isGrammar ? q.topic : (q.topic || (q.subject ? q.subject + ': ' + q.lesson_title : q.lesson_title || 'Lesson'));
    const content = isGrammar ? (q.explanation || '') : (q.content || q.explanation || '');
    const sectionOrder = ['meaning','synonym','antonym','grammar','syllabus','sentence'];
    const sectionIdx = sectionOrder.indexOf(currentSection);
    const completedQs = sectionOrder.slice(0, sectionIdx).reduce((sum, s) => sum + (mission.mission[s === 'sentence' ? 'sentences' : s]?.length || 0), 0) + currentIndex;
    const totalQs = mission.totalQuestions || 30;
    return (
      <div className="min-h-screen p-4 pb-20" style={{background:'#f1f5f9'}}><div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-3 pt-4">
          <button onClick={()=>setPlaying(false)} className="flex items-center gap-1 text-slate-500 font-bold text-sm">← Quit</button>
          <div className="badge badge-indigo">{isGrammar ? '✏️ Grammar' : '📖 Syllabus'}</div>
          <div className="text-sm font-black text-indigo-600">{currentIndex+1}/{list.length}</div>
        </div>
        <div className="progress-bar-track mb-6">
          <div className="progress-bar-fill" style={{width:`${((completedQs+1)/totalQs)*100}%`}}/>
        </div>
        <div className="card p-6 mb-4" style={isGrammar ? {borderLeft:'4px solid #f59e0b'} : {borderLeft:'4px solid #0d9488'}}>
          <div className={`badge mb-3 ${isGrammar ? 'badge-amber' : 'badge-emerald'}`}>
            {isGrammar ? '📝 Grammar Topic' : '📖 Lesson'}
          </div>
          {topic && <h2 className="text-xl font-black text-slate-900 mb-3">{topic}</h2>}
          {content && content !== topic && (
            <div className="rounded-xl p-4 text-sm text-slate-700 leading-relaxed" style={{background:'#f8fafc',whiteSpace:'pre-wrap'}}>{content}</div>
          )}
        </div>
        <button onClick={() => setShowingContent(false)}
          className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2"
          style={isGrammar ? {background:'linear-gradient(135deg,#d97706,#ea580c)',boxShadow:'0 4px 16px rgba(217,119,6,0.35)'} : {background:'linear-gradient(135deg,#059669,#0d9488)',boxShadow:'0 4px 16px rgba(5,150,105,0.35)'}}>
          Continue to Question →
        </button>
      </div></div>
    );
  }

  // PLAYING DAILY MISSION
  if (playing) {
    // SENTENCE FORMATION SECTION
    if (currentSection === 'sentence') {
      const sentList = mission.mission.sentences || [];
      if (!sentList.length || currentIndex >= sentList.length) return null; // Should be handled by goToNextSection
      const sq = sentList[currentIndex];
      // Stable shuffle — only set once per question
      if (shuffledWords.length === 0 || shuffledWords._qid !== `${currentIndex}`) {
        const sw = sq.words.slice().sort(() => 0.5 - Math.random());
        sw._qid = `${currentIndex}`;
        setShuffledWords(sw);
      }
      const usedIdxs = sentenceAnswer.map(a => a.idx);
      const sectionOrder = ['meaning','synonym','antonym','grammar','syllabus','sentence'];
      const completedQs = sectionOrder.slice(0, 5).reduce((sum, s) => sum + (mission.mission[s === 'sentence' ? 'sentences' : s]?.length || 0), 0) + currentIndex;
      const totalQs = mission.totalQuestions || 30;
      const checkSentence = () => {
        const userStr = sentenceAnswer.map(a => a.word).join(' ');
        const normalize = s => (s||'').toLowerCase().replace(/[.,!?]/g, '').replace(/\\s+/g, ' ').trim();
        const isCorrect = normalize(userStr) === normalize(sq.correct_sentence);
        setSentenceFb(isCorrect ? 'correct' : 'wrong');
        if (isCorrect) setScore(s => ({ ...s, sentence: s.sentence + 10 }));
        setAllAnswers(prev => [...prev, { section: 'sentence', question_text: sq.correct_sentence, selected_index: userStr, correct_index: sq.correct_sentence, is_correct: isCorrect }]);
        setTimeout(() => {
          setSentenceFb(null); setSentenceAnswer([]); setShuffledWords([]);
          if (currentIndex < sentList.length - 1) setCurrentIndex(currentIndex + 1);
          else goToNextSection('sentence');
        }, 2500);
      };
      return (
        <div className="min-h-screen bg-slate-50 p-4 pb-20"><div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2 pt-4"><button onClick={()=>setPlaying(false)} className="text-slate-500 font-medium">← Back</button><div className="font-bold text-slate-800 text-lg">🔤 Sentence Formation</div><div className="text-sm font-bold text-indigo-600">{currentIndex+1}/{sentList.length}</div></div>
          <p className="text-xs text-slate-400 text-center mb-2">Module 6/6 — Overall {completedQs+1}/{totalQs}</p>
          <div className="w-full bg-slate-200 h-2 rounded-full mb-8"><div className="bg-indigo-600 h-2 rounded-full transition-all" style={{width:`${((completedQs+1)/totalQs)*100}%`}}/></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 mb-4">
            <p className="text-sm text-slate-500 font-medium mb-4 text-center">Arrange the words to form a correct sentence</p>
            <div className={`answer-area mb-6 ${sentenceFb === 'correct' ? 'correct' : sentenceFb === 'wrong' ? 'wrong' : ''}`}>
              {sentenceAnswer.length === 0 && <span className="text-slate-400 text-sm">Tap words below...</span>}
              {sentenceAnswer.map((a, i) => <button key={i} className="answer-word" onClick={() => {if(!sentenceFb) setSentenceAnswer(sentenceAnswer.filter((_,j)=>j!==i))}}>{a.word}</button>)}
            </div>
            {sentenceFb && (
              <div className={`p-3 rounded-xl mb-4 text-sm ${sentenceFb==='correct'?'bg-emerald-50 border border-emerald-200 text-emerald-800':'bg-red-50 border border-red-200 text-red-800'}`}>
                <p className="font-bold mb-1">{sentenceFb==='correct'?'✅ Correct!':'❌ Incorrect!'}</p>
                <p><strong>Correct:</strong> {sq.correct_sentence}</p>
                {sentenceFb==='wrong' && <p><strong>Your answer:</strong> {sentenceAnswer.map(a=>a.word).join(' ')}</p>}
              </div>
            )}
            <div className="word-pool">
              {shuffledWords.map((w, i) => <button key={i} disabled={usedIdxs.includes(i) || !!sentenceFb} className={`word-btn ${usedIdxs.includes(i)?'used':''}`} onClick={() => setSentenceAnswer([...sentenceAnswer, {idx:i, word:w}])}>{w}</button>)}
            </div>
          </div>
          <button disabled={sentenceAnswer.length === 0 || !!sentenceFb} onClick={checkSentence} className="w-full gradient-btn py-4 rounded-2xl font-bold text-lg disabled:opacity-50">Check ✓</button>
        </div></div>
      );
    }

    const list = mission.mission[currentSection];
    if (!list || list.length === 0) return null; // Should not reach here due to goToNextSection logic
    const q = list[currentIndex];
    const sectionLabels = { meaning: 'Word Meaning', synonym: 'Synonyms', antonym: 'Antonyms', grammar: 'Grammar', syllabus: 'Syllabus' };
    const sectionIcons = { meaning: '📚', synonym: '🔗', antonym: '🔄', grammar: '✏️', syllabus: '📖' };
    const sectionOrder = ['meaning','synonym','antonym','grammar','syllabus','sentence'];
    const currentSectionIdx = sectionOrder.indexOf(currentSection);
    const completedQs = sectionOrder.slice(0, currentSectionIdx).reduce((sum, s) => sum + (mission.mission[s === 'sentence' ? 'sentences' : s]?.length || 0), 0) + currentIndex;
    const totalQs = mission.totalQuestions || 30;
    const pct = Math.round(((completedQs+1)/totalQs)*100);
    return (
      <div className="min-h-screen p-4 pb-20" style={{background:'#f1f5f9'}}><div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-3 pt-4">
          <button onClick={()=>setPlaying(false)} className="flex items-center gap-1 text-slate-500 font-bold text-sm">← Quit</button>
          <div className="badge badge-indigo">{sectionIcons[currentSection]} {sectionLabels[currentSection]}</div>
          <div className="text-sm font-black text-indigo-600">{currentIndex+1}/{list.length}</div>
        </div>
        {/* Progress */}
        <div className="progress-bar-track mb-6">
          <div className="progress-bar-fill" style={{width:`${pct}%`}} />
        </div>
        {/* Question card */}
        <div className="card p-6 mb-4 slide-up">
          {['meaning','synonym','antonym'].includes(currentSection) ? (
            <>
              <span className="badge badge-indigo mb-4 capitalize">{currentSection}</span>
              <div className="flex items-center justify-center gap-2 my-6">
                <h2 className="text-4xl font-black text-slate-900 text-center tracking-wide">{q.word}</h2>
                {speechSupported && (
                  <button onClick={() => speakText(q.word)} className="al-voice-btn" title="Listen to pronunciation">
                    <Volume2 size={18} />
                  </button>
                )}
              </div>
              <p className="text-center text-sm text-slate-400">What is the {currentSection} of this word?</p>
            </>
          ) : (
            <div className="flex items-start gap-2">
              <h2 className="text-lg font-bold text-slate-800 leading-relaxed flex-1">Q. {q.q}</h2>
              {speechSupported && (
                <button onClick={() => speakText(q.q)} className="al-voice-btn flex-shrink-0" title="Read question aloud">
                  <Volume2 size={16} />
                </button>
              )}
            </div>
          )}
        </div>
        {/* Options */}
        <div className="space-y-3">
          {(q.options||q.opts).map((opt,i)=>(
            <button key={i} disabled={!!feedback} onClick={()=>handleAnswer(i)} className={optBtnCls(i,feedback)}>
              <div className="option-letter">{String.fromCharCode(65+i)}</div>
              <span className="flex-1">{opt}</span>
              {speechSupported && !feedback && (
                <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); e.preventDefault(); speakText(opt); }}
                  className="al-voice-btn-sm flex-shrink-0" title={`Listen: ${opt}`}>
                  <Volume2 size={13} />
                </span>
              )}
              {feedback && i === feedback.correct && <span className={i === feedback.correct ? "text-white text-lg" : "text-emerald-500 text-lg"}>✓</span>}
              {feedback && i === feedback.selected && i !== feedback.correct && <span className="text-white text-lg">×</span>}
            </button>
          ))}
        </div>
      </div></div>
    );
  }

  // TEST MODE
  if (activeTest) {
    const q = activeTest.questions[testIdx];
    return (
      <div className="min-h-screen p-4 pb-20" style={{background:'#f1f5f9'}}><div className="max-w-md mx-auto">
        <div className="flex justify-between items-center mb-6 pt-4">
          <button onClick={()=>setActiveTest(null)} className="flex items-center gap-1 text-slate-500 font-bold text-sm">← Back</button>
          <div className="font-bold text-slate-800">{activeTest.title}</div>
          <div className="text-sm font-black text-indigo-600">{testIdx+1}/{activeTest.questions.length}</div>
        </div>
        <div className="card p-6 mb-4 slide-up">
          <h2 className="text-lg font-bold text-slate-800 leading-relaxed mb-6">Q. {q.q}</h2>
          <div className="space-y-3">
            {q.opts.map((opt,i)=>(
              <button key={i} disabled={!!testFb} onClick={()=>handleTestAns(i)} className={optBtnCls(i,testFb)}>
                <div className="option-letter">{String.fromCharCode(65+i)}</div>
                <span className="flex-1 text-left">{opt}</span>
                {testFb && i === testFb.correct && <span className={i === testFb.correct ? "text-white text-lg" : "text-emerald-500 text-lg"}>✓</span>}
                {testFb && i === testFb.selected && i !== testFb.correct && <span className="text-white text-lg">×</span>}
              </button>
            ))}
          </div>
        </div>
      </div></div>
    );
  }

  const tabs = [
    ['mission', 'Mission', CheckCircle],
    ['subjects', 'Subjects', BookOpen],
    ['leaderboard', 'Board', TrendingUp],
    ['practice', 'Practice', PenTool],
    ['ai-tutor', 'AI Tutor', Sparkles]
  ];

  if (error) {
    return (
      <DashboardLayout subtitle="Student Dashboard" tabs={tabs} activeTab={activeView} onTabChange={switchView} roleColor="indigo">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <p className="font-bold text-lg text-red-500 mb-2">Error</p>
          <p className="font-bold text-lg text-slate-800">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  if (!user || !mission) {
    return (
      <DashboardLayout subtitle="Student Dashboard" tabs={tabs} activeTab={activeView} onTabChange={switchView} roleColor="indigo">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-slate-400">
          <p className="font-bold text-lg">Loading your dashboard...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout subtitle="Student Dashboard" tabs={tabs} activeTab={activeView} onTabChange={switchView} roleColor="indigo">
      <UserLevelBar user={user} />

      <AnimatePresence mode="wait">

        {activeView==='mission' && (
          <motion.div 
            key="mission"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-6 pb-20"
          >
            {/* Mascot / Welcome Header */}
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-3xl p-6 text-white relative overflow-hidden shadow-xl mt-4 mx-4">
              <div className="absolute top-[-20px] right-[-20px] w-32 h-32 bg-white/10 rounded-full blur-2xl" />
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl shadow-inner">
                  🤖
                </div>
                <div>
                  <h1 className="text-xl font-black italic tracking-tight">GO GO, {user.username.toUpperCase()}!</h1>
                  <p className="text-indigo-100 text-xs font-bold opacity-80 uppercase tracking-widest">Unit 1: Foundation Skills</p>
                </div>
              </div>
            </div>

            {/* The Learning Path */}
            <div className="bg-white/40 rounded-[40px] p-6 mx-2 border-2 border-white shadow-inner">
              <LearningPath 
                mission={mission} 
                onStartNode={startMissionFlow} 
              />
            </div>

            {/* Original CTA if not using Path directly for start */}
            {!mission.status?.is_completed && mission.hasContent && (
               <div className="px-6">
                 <button
                  onClick={startMissionFlow}
                  className="w-full py-5 rounded-2xl font-black text-lg flex justify-center items-center gap-3 transition-all bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200 active:scale-95"
                >
                  <Play size={24} fill="currentColor" /> START TODAY'S MISSION
                </button>
               </div>
            )}


        {/* Available Tests */}
        {tests.filter(t=>!submittedTestIds.includes(t.id)).length > 0 && (
          <div className="card p-5">
            <h3 className="font-black text-slate-800 mb-3 flex items-center gap-2">📋 Pending Tests</h3>
            <div className="space-y-2">
              {tests.filter(t=>!submittedTestIds.includes(t.id)).map(t=>(
                <button key={t.id} onClick={()=>loadTest(t.id)}
                  className="w-full text-left flex justify-between items-center p-4 rounded-2xl transition-all hover:bg-indigo-50 border border-slate-100 hover:border-indigo-200">
                  <div><p className="font-bold text-slate-800">{t.title}</p></div>
                  <span className="btn btn-primary btn-sm">Start</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Adaptive Difficulty Indicator */}
        {adaptiveData && adaptiveData.overall_accuracy !== null && (
          <div className="card p-4 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
              adaptiveData.overall_accuracy >= 85 ? 'bg-orange-100' :
              adaptiveData.overall_accuracy >= 60 ? 'bg-blue-100' : 'bg-green-100'
            }`}>
              {adaptiveData.overall_accuracy >= 85 ? '🔥' : adaptiveData.overall_accuracy >= 60 ? '📚' : '🌱'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-800 text-sm">
                {adaptiveData.overall_accuracy >= 85 ? 'Challenge Mode' : adaptiveData.overall_accuracy >= 60 ? 'Standard Mode' : 'Reinforcement Mode'}
              </p>
              <p className="text-xs text-slate-500">7-day accuracy: {adaptiveData.overall_accuracy}% across {adaptiveData.total_answers} answers</p>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="w-12 h-12 rounded-full relative" style={{background:`conic-gradient(${adaptiveData.overall_accuracy >= 80 ? '#10b981' : adaptiveData.overall_accuracy >= 60 ? '#6366f1' : '#f59e0b'} ${adaptiveData.overall_accuracy * 3.6}deg, #e2e8f0 0deg)`}}>
                <div className="absolute inset-1 bg-white rounded-full flex items-center justify-center">
                  <span className="text-[10px] font-black">{adaptiveData.overall_accuracy}%</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SRS Review Card */}
        {srsData && srsData.due_count > 0 && (
          <div className="relative overflow-hidden rounded-[20px] p-5 text-white shadow-lg" style={{background:'linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)'}}>
            <div className="absolute top-[-20px] right-[-20px] w-[80px] h-[80px] rounded-full" style={{background:'rgba(255,255,255,0.1)'}} />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <RotateCcw size={16} />
                <span className="text-xs font-bold text-teal-200 uppercase tracking-wider">Spaced Repetition</span>
              </div>
              <h3 className="text-lg font-black mb-1">{srsData.due_count} Question{srsData.due_count !== 1 ? 's' : ''} Due for Review</h3>
              <p className="text-teal-200 text-xs mb-3">Questions you got wrong are resurfaced at optimal intervals to boost retention</p>
              <button onClick={() => { setSrsQuizActive(true); setSrsIndex(0); setSrsScore(0); setSrsFeedback(null); }}
                className="w-full py-3 rounded-xl font-bold text-sm flex justify-center items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-all">
                <RotateCcw size={16} /> Start SRS Review
              </button>
            </div>
          </div>
        )}

        {/* Weakness Quick-View */}
        {heatmapData && heatmapData.heatmap && heatmapData.heatmap.filter(h => h.severity === 'critical' || h.severity === 'weak').length > 0 && (
          <div className="card p-4">
            <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">📊 Areas to Improve</h3>
            <div className="space-y-2">
              {heatmapData.heatmap.filter(h => h.severity === 'critical' || h.severity === 'weak').slice(0, 3).map((w, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-lg">{w.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-700 truncate">{w.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{width:`${w.accuracy}%`, background: w.accuracy >= 60 ? '#10b981' : w.accuracy >= 40 ? '#f59e0b' : '#ef4444'}} />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500">{w.accuracy}%</span>
                    </div>
                  </div>
                  <button onClick={() => switchView('track')} className="text-xs font-bold text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
                    Details →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
          </motion.div>
        )}

        {activeView==='leaderboard' && (
          <motion.div 
            key="leaderboard"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-5 px-4"
          >

        <div className="section-header"><h1 className="section-title">🏆 Leaderboard</h1></div>
        <div className="card overflow-hidden">
          {leaderboard.length===0 ? (
            <div className="p-8 text-center text-slate-400"><p className="text-4xl mb-3">🎓</p><p className="font-semibold">No students yet</p></div>
          ) : leaderboard.map((l,i)=>(
            <div key={l.id} className={`flex items-center gap-4 px-5 py-4 border-b border-slate-50 last:border-0 ${l.username === user.username ? 'bg-indigo-50' : ''}`}>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0 ${i===0?'bg-yellow-400 text-white':i===1?'bg-slate-300 text-slate-700':i===2?'bg-amber-600 text-white':'bg-slate-100 text-slate-500'}`}>{i+1}</div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold truncate ${l.username === user.username ? 'text-indigo-700' : 'text-slate-800'}`}>{l.username}{l.username===user.username?' (You)':''}</p>
                <p className="text-xs text-slate-400">Class {l.class_name||'—'}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="font-black text-indigo-600">{l.xp}</p>
                <p className="text-[11px] text-slate-400">XP</p>
              </div>
            </div>
          ))}
        </div>
          </motion.div>
        )}

        {activeView==='practice' && (
          <motion.div 
            key="practice"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-5 px-4"
          >

        <div className="section-header">
          <h1 className="section-title">⚡ Practice</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5"><Calendar size={14} /> Today's content — {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['meaning','Word Meaning','📚','#eef2ff','#4338ca'],
            ['synonym','Synonyms','🔗','#ecfdf5','#065f46'],
            ['antonym','Antonyms','🔄','#fdf2f8','#9d174d'],
            ['grammar','Grammar','✏️','#fffbeb','#92400e'],
            ['sentence','Sentences','🔤','#f5f3ff','#5b21b6'],
            ['syllabus','Syllabus','📖','#f0fdfa','#134e4a'],
          ].map(([type,label,icon,bg,color])=>(
            <button key={type} onClick={()=>type==='sentence'?startSentencePractice():startPractice(type)}
              className="card card-hover text-left p-5 transition-all"
              style={{background:bg}}>
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="font-black text-sm" style={{color}}>{label}</h3>
              <p className="text-xs mt-0.5" style={{color,opacity:0.7}}>Mission's 5 →</p>
            </button>
          ))}
        </div>
        {tests.length>0 && (
          <div className="card p-5">
            <h3 className="font-black text-slate-800 mb-3">📋 Tests</h3>
            <div className="space-y-2">
              {tests.map(t=>(
                <button key={t.id} disabled={submittedTestIds.includes(t.id)} onClick={()=>loadTest(t.id)}
                  className="w-full text-left flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:bg-slate-50 disabled:opacity-60 transition-all">
                  <span className="font-bold text-slate-800">{t.title}</span>
                  {submittedTestIds.includes(t.id)
                    ? <span className="badge badge-emerald">✓ Done</span>
                    : <ArrowRight size={16} className="text-slate-400" />}
                </button>
              ))}
            </div>
          </div>
        )}
          </motion.div>
        )}
      </AnimatePresence>


      {/* ==================== AI TUTOR VIEW ==================== */}
      {activeView==='ai-tutor' && (<div className="flex flex-col h-[calc(100vh-180px)] md:h-[calc(100vh-120px)] slide-up">
        <div className="card flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md">
                <Bot size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-1.5">Alpha AI Tutor <Sparkles size={14} className="text-amber-400" /></h3>
                <p className="text-[11px] text-slate-500">Class {user?.class_name || '?'} • {user?.board_name || 'CBSE'} • Ask any doubt!</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {aiMessages.length > 0 && (
                <button onClick={clearAiSession} className="p-2 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Clear chat">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
            {aiMessages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 flex items-center justify-center mb-4">
                  <Bot size={36} className="text-violet-500" />
                </div>
                <h3 className="font-bold text-slate-700 text-lg mb-2">Hey {user?.username}! 👋</h3>
                <p className="text-sm text-slate-500 mb-6 max-w-xs">I'm Alpha, your personal AI tutor. Ask me anything about your Class {user?.class_name || ''} subjects!</p>
                <div className="grid grid-cols-1 gap-2 w-full max-w-xs">
                  {[
                    '📚 Explain photosynthesis simply',
                    '✏️ Help me with grammar rules',
                    '🔢 What are prime numbers?',
                    '🧪 Give me 5 practice questions on fractions',
                  ].map((suggestion, i) => (
                    <button key={i} onClick={() => { setAiInput(suggestion.replace(/^[^\s]+ /, '')); }}
                      className="text-left text-sm p-3 rounded-xl border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-600 transition-all">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {aiMessages.map((msg, i) => (
              <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[88%] p-3.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-violet-600 to-purple-600 text-white rounded-tr-sm'
                    : msg.isError
                      ? 'bg-red-50 text-red-700 border border-red-200 rounded-tl-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                }`} style={{whiteSpace: 'pre-wrap'}}>
                  {msg.content}
                </div>
                <div className="flex items-center gap-1.5 mt-1 mx-1">
                  <span className="text-[10px] text-slate-400">{new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                  {msg.role === 'assistant' && !msg.isError && speechSupported && (
                    <button onClick={() => isSpeaking ? stopSpeaking() : speakText(msg.content)}
                      className={`p-1 rounded-lg transition-colors ${isSpeaking ? 'text-violet-600 bg-violet-50' : 'text-slate-400 hover:text-violet-500 hover:bg-violet-50'}`}
                      title={isSpeaking ? 'Stop speaking' : 'Read aloud'}>
                      {isSpeaking ? <StopCircle size={12} /> : <Volume2 size={12} />}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div className="flex items-start">
                <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl rounded-tl-sm">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}} />
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{animationDelay: '150ms'}} />
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" style={{animationDelay: '300ms'}} />
                  </div>
                </div>
              </div>
            )}
            <div ref={aiChatEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex-shrink-0">
            <form onSubmit={sendAiMessage} className="flex items-center gap-2">
              {recognitionSupported && (
                <button type="button" onClick={toggleListening}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                    isListening
                      ? 'bg-red-500 text-white shadow-lg shadow-red-200 al-pulse-ring'
                      : 'bg-slate-100 text-slate-500 hover:bg-violet-50 hover:text-violet-600'
                  }`} title={isListening ? 'Stop listening' : 'Voice input'}>
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
              )}
              <input
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                placeholder={isListening ? 'Listening... 🎤' : 'Ask Alpha anything...'}
                disabled={aiLoading || isListening}
                className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-violet-500 focus:border-violet-500 disabled:opacity-50 transition-all"
              />
              <button type="submit" disabled={!aiInput.trim() || aiLoading}
                className="w-11 h-11 bg-gradient-to-br from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-all shadow-sm flex-shrink-0">
                <Send size={18} />
              </button>
            </form>
            {isListening && <p className="text-xs text-red-500 font-medium mt-1.5 text-center animate-pulse">🎤 Listening... speak now</p>}
          </div>
        </div>
      </div>)}

      {activeView === 'messages' && (
          <div className="flex flex-col gap-4 h-[75vh] slide-up">
              <div className="card p-4 border-b border-slate-100 flex flex-col h-full">
                  <div className="pb-4 border-b border-slate-100 mb-4">
                      <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2"><MessageCircle size={20}/> Ask Doubts</h3>
                      <p className="text-xs text-slate-500 mt-1">Chat with your assigned class teacher</p>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 mb-4">
                      {messages.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <MessageCircle size={48} className="mb-2 opacity-50" />
                              <p className="text-sm">No messages yet. Ask a doubt!</p>
                          </div>
                      ) : (
                          messages.map((m, i) => (
                              <div key={i} className={`flex flex-col ${m.sender_role === 'STUDENT' ? 'items-end' : 'items-start'}`}>
                                  <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${m.sender_role === 'STUDENT' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-slate-100 text-slate-800 rounded-tl-none'}`}>
                                      {m.message}
                                  </div>
                                  <span className="text-[10px] text-slate-400 mt-1 mx-1">{new Date(m.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                              </div>
                          ))
                      )}
                  </div>
                  
                  <div className="pt-2 border-t border-slate-100 mt-auto">
                      <form onSubmit={sendMessage} className="flex gap-2">
                          <input type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)} placeholder="Type your doubt..." className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
                          <button type="submit" disabled={!newMessage.trim()} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white w-12 rounded-xl flex items-center justify-center transition-colors shadow-sm"><Send size={20} className="ml-1"/></button>
                      </form>
                  </div>
              </div>
          </div>
      )}



      {activeView==='profile' && (<div className="space-y-6 slide-up">
        <h1 className="font-bold text-slate-800 text-2xl text-center mb-4">Profile</h1>
        <div className="card p-6 flex flex-col items-center">
          <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 font-bold text-3xl mb-3">{user.username[0].toUpperCase()}</div>
          <h2 className="font-bold text-xl text-slate-800">{user.username}</h2><p className="text-slate-500">Class {user.class_name||'N/A'} {user.section_name?`- ${user.section_name}`:''}{user.board_name ? ` • ${user.board_name}` : ''}</p>
          <div className="w-full flex gap-4 border-t border-slate-100 pt-4 mt-4"><div className="flex-1 text-center"><p className="text-xs text-slate-500">Streak</p><p className="font-bold text-orange-500"><Flame size={14} className="inline"/> {user.streak}</p></div><div className="flex-1 text-center"><p className="text-xs text-slate-500">XP</p><p className="font-bold text-yellow-500"><Star size={14} className="inline"/> {user.xp}</p></div></div>
        </div>
        <div className="card p-2 space-y-1">
          <button onClick={()=>{switchView('track');}} className="w-full flex items-center justify-between p-4 font-bold text-slate-700 hover:bg-slate-50 rounded-2xl"><div className="flex items-center gap-3"><BarChart2 size={20} className="text-emerald-500"/> Progress</div><ArrowRight size={16} className="text-slate-400"/></button>
          <button onClick={async()=>{try{await fetchReview();}catch(e){}setActiveView('review');}} className="w-full flex items-center justify-between p-4 font-bold text-slate-700 hover:bg-slate-50 rounded-2xl"><div className="flex items-center gap-3"><RotateCcw size={20} className="text-blue-500"/> Review</div><ArrowRight size={16} className="text-slate-400"/></button>
          <button onClick={()=>{switchView('messages');}} className="w-full flex items-center justify-between p-4 font-bold text-slate-700 hover:bg-slate-50 rounded-2xl"><div className="flex items-center gap-3"><MessageCircle size={20} className="text-cyan-500"/> Messages / Ask Doubts</div><ArrowRight size={16} className="text-slate-400"/></button>
          <button onClick={async()=>{const h={Authorization:`Bearer ${localStorage.getItem('token')}`};const r=await axios.get('/api/student/badges',{headers:h});setBadges(r.data);setShowBadgesModal(true);}} className="w-full flex items-center justify-between p-4 font-bold text-slate-700 hover:bg-slate-50 rounded-2xl"><div className="flex items-center gap-3"><Award size={20} className="text-indigo-500"/> My Badges</div><ArrowRight size={16} className="text-slate-400"/></button>
          <button onClick={()=>{localStorage.clear();router.push('/');}} className="w-full flex items-center justify-between p-4 font-bold text-red-500 hover:bg-red-50 rounded-2xl"><div className="flex items-center gap-3"><LogOut size={20}/> Logout</div></button>
        </div>
      </div>)}

      {activeView==='track' && (<div className="space-y-6 slide-up">
        <div className="flex items-center gap-4 mb-2"><button onClick={()=>setActiveView('profile')} className="text-indigo-600 font-bold">← Back</button><h1 className="font-bold text-slate-800 text-xl">Progress Tracker</h1></div>
        {/* Donut Charts Only */}
        {progressStats && (<div className="mb-6"><h3 className="font-bold text-slate-800 mb-3">Performance Overview</h3><div className="grid grid-cols-3 gap-3">
          {[['meaning','Words','#6366f1'],['synonym','Synonyms','#10b981'],['antonym','Antonyms','#ec4899'],['grammar','Grammar','#f59e0b'],['sentence','Sentence','#8b5cf6'],['syllabus','Syllabus','#14b8a6']].map(([key,label,color])=>{
            const s = progressStats[key] || {correct:0,incorrect:0};
            const total = s.correct+s.incorrect;
            const pct = total ? Math.round((s.correct/total)*100) : 0;
            return (<div key={key} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
              <div className="w-16 h-16 mx-auto mb-2 rounded-full relative" style={{background:`conic-gradient(${color} ${pct*3.6}deg, #e2e8f0 0deg)`}}><div className="absolute inset-1.5 bg-white rounded-full flex items-center justify-center"><span className="text-xs font-bold">{pct}%</span></div></div>
              <p className="text-xs font-bold text-slate-700">{label}</p>
              <p className="text-[10px] text-slate-400">{s.correct}✓ {s.incorrect}✗</p>
            </div>);
          })}
        </div></div>)}

        {/* ==================== WEAKNESS HEATMAP ==================== */}
        {heatmapData && heatmapData.heatmap && heatmapData.heatmap.length > 0 && (
          <div>
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">📊 Weakness Heatmap</h3>
            <div className="space-y-3">
              {heatmapData.heatmap.map((item, i) => (
                <div key={i} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{item.icon}</span>
                      <span className="font-bold text-slate-800 text-sm">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{
                        background: item.severity === 'strong' ? '#dcfce7' : item.severity === 'average' ? '#fef9c3' : item.severity === 'weak' ? '#ffedd5' : '#fee2e2',
                        color: item.severity === 'strong' ? '#166534' : item.severity === 'average' ? '#854d0e' : item.severity === 'weak' ? '#c2410c' : '#991b1b'
                      }}>
                        {item.badge}
                      </span>
                      {item.trend === 'improving' && <span className="text-xs text-emerald-600 font-bold">📈</span>}
                      {item.trend === 'declining' && <span className="text-xs text-red-500 font-bold">📉</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${item.accuracy}%`,
                        background: item.severity === 'strong' ? '#10b981' : item.severity === 'average' ? '#eab308' : item.severity === 'weak' ? '#f97316' : '#ef4444'
                      }} />
                    </div>
                    <span className="text-sm font-black text-slate-700 w-10 text-right">{item.accuracy}%</span>
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-[10px] text-slate-400">{item.correct}✓ correct · {item.incorrect}✗ wrong · {item.total} total</span>
                    {item.recent_accuracy !== null && (
                      <span className="text-[10px] text-slate-500">7-day: <span className="font-bold">{item.recent_accuracy}%</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Missed Questions */}
        {heatmapData && heatmapData.top_missed && heatmapData.top_missed.length > 0 && (
          <div>
            <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">❌ Most Missed Questions</h3>
            <div className="card divide-y divide-slate-100">
              {heatmapData.top_missed.map((m, i) => (
                <div key={i} className="p-3 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-black text-red-600">{m.miss_count}×</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 truncate">{m.question}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{m.section}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>)}

      {/* ==================== SRS QUIZ MODAL ==================== */}
      {srsQuizActive && srsData && srsData.items && srsData.items.length > 0 && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{background:'#f1f5f9'}}>
          <div className="p-4 pb-20 max-w-md mx-auto">
            <div className="flex justify-between items-center mb-4 pt-4">
              <button onClick={() => setSrsQuizActive(false)} className="text-slate-500 font-bold text-sm">← Close</button>
              <div className="badge badge-emerald">🔁 SRS Review</div>
              <div className="text-sm font-black text-teal-600">{srsIndex + 1}/{srsData.items.length}</div>
            </div>
            <div className="progress-bar-track mb-6">
              <div className="progress-bar-fill" style={{width: `${((srsIndex + 1) / srsData.items.length) * 100}%`, background: 'linear-gradient(90deg, #0f766e, #14b8a6)'}} />
            </div>

            {srsIndex < srsData.items.length ? (() => {
              const item = srsData.items[srsIndex];
              return (
                <>
                  <div className="card p-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="badge badge-indigo capitalize">{item.section}</span>
                      <span className="text-[10px] text-slate-400 font-bold">{item.days_ago} days ago</span>
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">{item.question}</h2>
                  </div>
                  <div className="space-y-3">
                    {item.options.map((opt, i) => {
                      const isCorrect = String(i) === String(item.correct_index);
                      let cls = 'quiz-option';
                      if (srsFeedback !== null) {
                        if (isCorrect) cls = 'quiz-option bg-emerald-500 text-white border-emerald-500';
                        else if (i === srsFeedback && !isCorrect) cls = 'quiz-option bg-red-500 text-white border-red-500';
                      }
                      return (
                        <button key={i} disabled={srsFeedback !== null} onClick={() => {
                          setSrsFeedback(i);
                          if (isCorrect) setSrsScore(s => s + 1);
                          setTimeout(() => {
                            setSrsFeedback(null);
                            if (srsIndex < srsData.items.length - 1) setSrsIndex(srsIndex + 1);
                            else setSrsIndex(srsData.items.length); // trigger completion
                          }, 1500);
                        }} className={cls}>
                          <div className="option-letter">{String.fromCharCode(65 + i)}</div>
                          <span className="flex-1">{opt}</span>
                          {srsFeedback !== null && isCorrect && <span className="text-white text-lg">✓</span>}
                          {srsFeedback !== null && i === srsFeedback && !isCorrect && <span className="text-white text-lg">×</span>}
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })() : (
              <div className="card p-8 text-center">
                <div className="text-5xl mb-4">🎉</div>
                <h2 className="text-2xl font-black text-slate-800 mb-2">SRS Review Complete!</h2>
                <p className="text-slate-500 mb-4">You scored {srsScore}/{srsData.items.length}</p>
                <div className="w-20 h-20 mx-auto mb-4 rounded-full relative" style={{background:`conic-gradient(#14b8a6 ${Math.round((srsScore/srsData.items.length)*100)*3.6}deg, #e2e8f0 0deg)`}}>
                  <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center">
                    <span className="text-lg font-black text-teal-600">{Math.round((srsScore/srsData.items.length)*100)}%</span>
                  </div>
                </div>
                <button onClick={() => setSrsQuizActive(false)} className="gradient-btn w-full py-3 rounded-2xl font-bold">
                  Back to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeView==='review' && (<div className="space-y-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <button onClick={()=>{if(reviewDetail){setReviewDetail(null);setReviewAnswers([]);}else setActiveView('profile');}} className="text-indigo-600 font-bold">← Back</button>
            <h1 className="font-bold text-slate-800 text-xl">{reviewDetail ? `Review: ${reviewDetail}` : 'Review Attempts'}</h1>
          </div>
          {reviewDetail && (
            <button onClick={startReplay} className="bg-indigo-600 text-white px-4 py-1.5 rounded-full font-bold text-sm shadow hover:bg-indigo-700 transition-colors">
              Replay Mission
            </button>
          )}
        </div>
        {!reviewDetail ? <>
          {reviewItems.length===0 ? <p className="text-slate-500">No completed attempts yet.</p> : reviewItems.map((r,i)=>(
            <button key={i} onClick={()=>openReviewDetail(r.date)} className="w-full text-left bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-2 hover:bg-indigo-50 transition-all">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-800">
                    Mission Session – {safeDate(r.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.completion_time ? ` – Completed at ${safeDate(r.completion_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : (r.attempt_time ? ` – Completed at ${safeDate(r.attempt_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}` : '')}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {r.duration ? `Duration: ${Math.floor(r.duration/60)}m ${r.duration%60}s` : 'Completed Mission Session Details'}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="text-xs font-bold text-yellow-500">XP Earned: {r.vocab_score + r.grammar_score + r.syllabus_score + (r.sentence_score||0)}</p>
                  <p className="text-xs font-bold mt-0.5"><span className="text-emerald-600">{r.correct||0} ✓</span> <span className="text-red-500">{r.incorrect||0} ✗</span></p>
                </div>
              </div>
            </button>
          ))}
        </>
        : 
        <>
          {reviewAnswers.length > 0 && (() => {
            const correct = reviewAnswers.filter(a=>a.is_correct).length;
            const wrong = reviewAnswers.length - correct;
            const accuracy = Math.round((correct/reviewAnswers.length)*100);
            const rItem = reviewItems.find(r => r.date === reviewDetail);
            const xpEarned = rItem ? (rItem.vocab_score + rItem.grammar_score + rItem.syllabus_score + (rItem.sentence_score||0)) : 0;
            return (<div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mb-4 flex justify-around text-center">
              <div><p className="text-xl font-bold text-yellow-500">{xpEarned}</p><p className="text-xs text-slate-500">XP Earned</p></div>
              <div><p className="text-xl font-bold text-emerald-600">{correct}</p><p className="text-xs text-slate-500">Correct</p></div>
              <div><p className="text-xl font-bold text-red-500">{wrong}</p><p className="text-xs text-slate-500">Wrong</p></div>
              <div><p className="text-xl font-bold text-indigo-600">{accuracy}%</p><p className="text-xs text-slate-500">Accuracy</p></div>
            </div>);
          })()}
          {/* Group answers by module */}
          {(() => {
            const modules = [
              { key: 'meaning', label: '📚 Words' },
              { key: 'synonym', label: '🔗 Synonyms' },
              { key: 'antonym', label: '🔄 Antonyms' },
              { key: 'grammar', label: '✏️ Grammar' },
              { key: 'syllabus', label: '📖 Syllabus' },
              { key: 'sentence', label: '🔤 Sentence Formation' },
              { key: 'vocab', label: '📚 Vocabulary (legacy)' },
            ];
            const grouped = {};
            reviewAnswers.forEach(a => { const k = a.section; if(!grouped[k]) grouped[k]=[]; grouped[k].push(a); });
            return modules.filter(m => grouped[m.key]?.length > 0).map(m => (
              <div key={m.key} className="mb-4">
                <h3 className="font-bold text-slate-800 mb-2">{m.label} <span className="text-xs text-slate-400">({grouped[m.key].filter(a=>a.is_correct).length}/{grouped[m.key].length} correct)</span></h3>
                {grouped[m.key].map((a,i) => (
                  <div key={i} className={`p-3 rounded-xl mb-2 ${a.is_correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
                    <p className="font-medium text-sm text-slate-800">{a.question_text}</p>
                    <div className="mt-2 text-xs space-y-1">
                      {(() => {
                        let opts = [];
                        try { opts = a.options_json ? JSON.parse(a.options_json) : []; } catch(e) {}
                        const formatOpt = (idx) => {
                          if (a.section === 'sentence') return idx;
                          const num = parseInt(idx);
                          if (!isNaN(num) && opts && opts.length > num) return opts[num];
                          return `Option ${num + 1}`;
                        };
                        return (
                          <>
                            <p>{a.is_correct ? '✅' : '❌'} <strong>Your answer:</strong> <span className={a.is_correct ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>{formatOpt(a.selected_index)}</span></p>
                            {!a.is_correct && <p>✅ <strong>Correct answer:</strong> <span className="text-emerald-700 font-bold">{formatOpt(a.correct_index)}</span></p>}
                          </>
                        );
                      })()}
                      <p className="text-slate-400 capitalize">Section: {a.section} {a.created_at ? `• ${safeDate(a.created_at).toLocaleTimeString()}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            ));
          })()}
          {reviewAnswers.length===0 && <p className="text-slate-500 text-sm">No detailed answers recorded for this attempt.</p>}
        </>}
      </div>)}

      {activeView==='notifications' && (<div className="space-y-4 slide-up">
        <h1 className="font-bold text-slate-800 text-2xl text-center mb-2">Notifications</h1>
        {notifications.length===0 ? <div className="card p-8 text-center text-slate-500"><Bell className="mx-auto text-slate-200 mb-3" size={40}/><p>No notifications yet.</p></div> : notifications.map((n,i)=><div key={i} className="card p-4"><p className="text-sm text-slate-700">{n.message}</p><p className="text-xs text-slate-400 mt-1">{safeDate(n.created_at).toLocaleString()}</p></div>)}
      </div>)}

      {/* Floating AI Tutor Button (visible on non-AI views) */}
      {activeView !== 'ai-tutor' && !playing && !activeTest && !showPracticeModal && !sentencePractice && (
        <button
          onClick={() => switchView('ai-tutor')}
          className="fixed bottom-24 md:bottom-8 right-4 md:right-8 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-600 text-white shadow-xl shadow-violet-300/40 flex items-center justify-center hover:scale-105 active:scale-95 transition-all al-fab-pulse"
          title="Ask AI Tutor"
        >
          <Sparkles size={22} />
        </button>
      )}

    {showPracticeModal && practiceQs.length>0 && (<div className="fixed inset-0 z-50 overflow-y-auto" style={{background:'#f1f5f9'}}><div className="p-4 pb-20 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-2 pt-4">
        <button onClick={()=>setShowPracticeModal(false)} className="flex items-center gap-1 text-slate-500 font-bold text-sm">← Close</button>
        <div className="font-bold text-slate-800">Today's Practice</div>
        <div className="text-sm font-black text-indigo-600">{practiceIdx+1}/{practiceQs.length}</div>
      </div>
      <p className="text-xs text-center text-slate-400 mb-4 flex items-center justify-center gap-1"><Calendar size={12}/> {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })} — Same questions all day</p>
      <div className="card p-6 mb-4 slide-up">
        <h2 className="text-lg font-bold text-slate-800 leading-relaxed mb-6">Q. {practiceQs[practiceIdx].q}</h2>
        <div className="space-y-3">
          {practiceQs[practiceIdx].opts.map((o,i)=>(
            <button key={i} disabled={!!practiceFb} onClick={()=>handlePracticeAns(i)} className={optBtnCls(i,practiceFb)}>
              <div className="option-letter">{String.fromCharCode(65+i)}</div>
              <span className="flex-1 text-left">{o}</span>
              {practiceFb && i === practiceFb.correct && <span className={i === practiceFb.correct ? "text-white text-lg" : "text-emerald-500 text-lg"}>✓</span>}
              {practiceFb && i === practiceFb.selected && i !== practiceFb.correct && <span className="text-white text-lg">×</span>}
            </button>
          ))}
        </div>
      </div>
    </div></div>)}

    {showBadgesModal && (<div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl p-6 w-full max-w-md"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-bold">My Badges</h2><button onClick={()=>setShowBadgesModal(false)}><X size={20}/></button></div>{badges.map((b,i)=><div key={i} className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-4 mb-2"><span className="text-2xl">🏆</span><div><h4 className="font-bold text-slate-800">{b.badge_name}</h4><p className="text-xs text-slate-500">{new Date(b.earned_at).toLocaleDateString()}</p></div></div>)}{badges.length===0&&<p className="text-center text-slate-500">No badges yet.</p>}</div></div>)}

    {/* ---- SUBJECTS VIEW ---- */}
    {activeView === 'subjects' && !subjectQuiz && !subjectQuizResult && (<>
      {!selectedSubject ? (<>
        <h2 className="text-xl font-bold text-slate-800 mb-4">My Subjects</h2>
        {studentSubjects.length === 0 && <div className="card p-8 text-center text-slate-500">No subjects enabled for your class yet. Ask your Principal to configure subjects.</div>}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {studentSubjects.map(sub => {
            const prog = subjectProgress.filter(p => p.subject_id === sub.id);
            const totalAttempted = prog.reduce((a, p) => a + (p.total_attempted || 0), 0);
            const totalCorrect = prog.reduce((a, p) => a + (p.total_correct || 0), 0);
            const accuracy = totalAttempted > 0 ? Math.round((totalCorrect / totalAttempted) * 100) : 0;
            return (
              <button key={sub.id} onClick={async () => { setSelectedSubject(sub); const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; try { const r = await axios.get(`/api/student/subject-chapters?subject_id=${sub.id}`, { headers: h }); setSubjectChapters(r.data); } catch(e) { setSubjectChapters([]); } }} className="card p-4 text-left hover:shadow-md transition-all">
                <div className="text-3xl mb-2">{sub.icon}</div>
                <p className="font-bold text-sm text-slate-800">{sub.name}</p>
                {sub.teacher_name && <p className="text-[10px] text-slate-400">👩‍🏫 {sub.teacher_name}</p>}
                {totalAttempted > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${accuracy}%`, background: sub.color || '#4f46e5'}}></div></div>
                    <p className="text-[10px] text-slate-400 mt-1">{accuracy}% accuracy • {totalAttempted} Qs</p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </>) : (<>
        <button onClick={() => { setSelectedSubject(null); setSubjectChapters([]); }} className="flex items-center gap-1 text-indigo-600 font-bold text-sm mb-4">← All Subjects</button>
        <div className="card p-5 mb-4" style={{borderLeft: `4px solid ${selectedSubject.color || '#4f46e5'}`}}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{selectedSubject.icon}</span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">{selectedSubject.name}</h2>
              <p className="text-xs text-slate-500">{selectedSubject.code} • {selectedSubject.category}</p>
            </div>
          </div>
        </div>
        {/* Quick quiz (all questions) */}
        <button onClick={async () => { const h = { Authorization: `Bearer ${localStorage.getItem('token')}` }; try { const r = await axios.get(`/api/student/subject-quiz?subject_id=${selectedSubject.id}`, { headers: h }); if (r.data.length === 0) { alert('No questions available for this subject yet.'); return; } setSubjectQuiz({ subject: selectedSubject, chapter: null, questions: r.data }); setSubjectQuizIdx(0); setSubjectQuizAnswers([]); setSubjectQuizFb(null); setSubjectQuizResult(null); } catch(e) { alert('Error loading quiz'); }}} className="w-full gradient-btn py-3 rounded-2xl font-bold text-sm mb-4 flex items-center justify-center gap-2"><Zap size={16}/> Quick Quiz (All Chapters)</button>
        {/* Chapters */}
        <h3 className="font-bold text-slate-700 mb-3">Chapters</h3>
        {subjectChapters.length === 0 && <p className="text-slate-400 text-sm">No chapters configured yet.</p>}
        {subjectChapters.map(ch => (
          <button key={ch.id} onClick={async () => { 
            if (ch.content) {
              setReadingChapter(ch);
            } else {
              if (ch.question_count === 0) { alert('No questions in this chapter yet.'); return; }
              const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
              try {
                const r = await axios.get(`/api/student/subject-quiz?subject_id=${selectedSubject.id}&chapter_id=${ch.id}`, { headers: h });
                setSubjectQuiz({ subject: selectedSubject, chapter: ch, questions: r.data });
                setSubjectQuizIdx(0); setSubjectQuizAnswers([]); setSubjectQuizFb(null); setSubjectQuizResult(null);
              } catch(e) { alert('Error'); }
            }
          }} className="w-full card p-4 mb-2 flex items-center gap-3 text-left hover:shadow-md transition-all">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm" style={{background: (selectedSubject.color || '#4f46e5') + '20', color: selectedSubject.color || '#4f46e5'}}>{ch.chapter_number}</span>
            <div className="flex-1">
              <p className="font-bold text-sm text-slate-800">{ch.chapter_title}</p>
              {ch.description && <p className="text-xs text-slate-500">{ch.description}</p>}
              {ch.content && <p className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">📖 Read Lesson Available</p>}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">{ch.question_count} Qs</p>
              <ArrowRight size={14} className="text-slate-300 ml-auto mt-1"/>
            </div>
          </button>
        ))}
      </>)}
    </>)}

    {/* Reading Chapter Content View */}
    {activeView === 'subjects' && readingChapter && !subjectQuiz && (
      <div className="slide-up">
        <button onClick={() => setReadingChapter(null)} className="flex items-center gap-1 text-slate-500 font-bold text-sm mb-4">← Back to Chapters</button>
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <span className="w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg" style={{background: (selectedSubject?.color || '#4f46e5') + '20', color: selectedSubject?.color || '#4f46e5'}}>{readingChapter.chapter_number}</span>
            <div>
              <h2 className="text-xl font-bold text-slate-800">{readingChapter.chapter_title}</h2>
              <p className="text-sm text-slate-500">{selectedSubject?.name}</p>
            </div>
          </div>
          
          <div className="prose prose-slate max-w-none">
            <div className="text-slate-700 leading-relaxed whitespace-pre-wrap text-base">
              {readingChapter.content}
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          <button onClick={() => setReadingChapter(null)} className="flex-1 py-4 rounded-2xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all">Done Reading</button>
          <button onClick={async () => {
            if (readingChapter.question_count === 0) { alert('No questions in this chapter yet.'); return; }
            const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
            try {
              const r = await axios.get(`/api/student/subject-quiz?subject_id=${selectedSubject?.id}&chapter_id=${readingChapter.id}`, { headers: h });
              setSubjectQuiz({ subject: selectedSubject, chapter: readingChapter, questions: r.data });
              setSubjectQuizIdx(0); setSubjectQuizAnswers([]); setSubjectQuizFb(null); setSubjectQuizResult(null);
              setReadingChapter(null);
            } catch(e) { alert('Error starting quiz'); }
          }} className="flex-[2] py-4 rounded-2xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2" style={{background: `linear-gradient(135deg, ${selectedSubject?.color || '#4338ca'}, ${selectedSubject?.color || '#4338ca'}dd)`}}>
            <Zap size={18}/> Practice Quiz
          </button>
        </div>
      </div>
    )}

    {/* Subject Quiz Active */}
    {activeView === 'subjects' && subjectQuiz && !subjectQuizResult && (() => {
      const q = subjectQuiz.questions[subjectQuizIdx];
      if (!q) return null;
      // correct_answer can be stored as index ("0","1","2") or as text ("Paris")
      let correctIdx = parseInt(q.correct_answer);
      if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= (q.options || []).length) {
        // Try to find by matching text
        correctIdx = (q.options || []).findIndex(o => o === q.correct_answer);
        if (correctIdx < 0) correctIdx = 0; // fallback
      }
      return (
        <div className="slide-up">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => { setSubjectQuiz(null); setSubjectQuizFb(null); }} className="text-slate-500 font-bold text-sm">← Back</button>
            <div className="text-sm font-bold" style={{color: subjectQuiz.subject.color || '#4f46e5'}}>{subjectQuiz.subject.icon} {subjectQuiz.chapter?.chapter_title || subjectQuiz.subject.name}</div>
            <div className="text-sm font-black text-indigo-600">{subjectQuizIdx + 1}/{subjectQuiz.questions.length}</div>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-200 rounded-full mb-6 overflow-hidden"><div className="h-full rounded-full transition-all" style={{width: `${((subjectQuizIdx + 1) / subjectQuiz.questions.length) * 100}%`, background: subjectQuiz.subject.color || '#4f46e5'}}></div></div>
          <div className="card p-6">
            <p className="text-lg font-bold text-slate-800 leading-relaxed mb-6">Q. {q.question_text}</p>
            <div className="space-y-3">
              {(q.options || []).map((opt, i) => {
                let btnClass = 'quiz-option';
                if (subjectQuizFb) {
                  if (i === subjectQuizFb.correct) btnClass = 'quiz-option correct';
                  else if (i === subjectQuizFb.selected && i !== subjectQuizFb.correct) btnClass = 'quiz-option wrong';
                  else btnClass = 'quiz-option faded';
                }
                return (
                  <button key={i} disabled={!!subjectQuizFb} onClick={() => {
                    const isCorrect = i === correctIdx;
                    setSubjectQuizFb({ selected: i, correct: correctIdx });
                    const newAnswers = [...subjectQuizAnswers, { question_id: q.id, selected_answer: String(i) }];
                    setSubjectQuizAnswers(newAnswers);
                    setTimeout(() => {
                      setSubjectQuizFb(null);
                      if (subjectQuizIdx < subjectQuiz.questions.length - 1) {
                        setSubjectQuizIdx(subjectQuizIdx + 1);
                      } else {
                        // Submit
                        const h = { Authorization: `Bearer ${localStorage.getItem('token')}` };
                        axios.post('/api/student/subject-quiz/submit', {
                          subject_id: subjectQuiz.subject.id,
                          chapter_id: subjectQuiz.chapter?.id || null,
                          answers: newAnswers
                        }, { headers: h }).then(r => {
                          setSubjectQuizResult(r.data);
                          setSubjectQuiz(null);
                        }).catch(() => { alert('Error submitting quiz'); setSubjectQuiz(null); });
                      }
                    }, 1200);
                  }} className={btnClass}>
                    <div className="option-letter">{String.fromCharCode(65 + i)}</div>
                    <span className="flex-1 text-left">{opt}</span>
                    {subjectQuizFb && i === subjectQuizFb.correct && <span className="text-white text-lg">✓</span>}
                    {subjectQuizFb && i === subjectQuizFb.selected && i !== subjectQuizFb.correct && <span className="text-white text-lg">×</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    })()}

    {/* Subject Quiz Result */}
    {activeView === 'subjects' && subjectQuizResult && (
      <div className="card p-6 text-center slide-up">
        <div className="text-5xl mb-4">{subjectQuizResult.accuracy >= 80 ? '🎉' : subjectQuizResult.accuracy >= 50 ? '👍' : '💪'}</div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Quiz Complete!</h2>
        <div className="grid grid-cols-3 gap-3 my-6">
          <div className="bg-emerald-50 rounded-xl p-3"><p className="text-2xl font-bold text-emerald-600">{subjectQuizResult.correct}</p><p className="text-xs text-slate-500">Correct</p></div>
          <div className="bg-red-50 rounded-xl p-3"><p className="text-2xl font-bold text-red-500">{subjectQuizResult.total - subjectQuizResult.correct}</p><p className="text-xs text-slate-500">Wrong</p></div>
          <div className="bg-indigo-50 rounded-xl p-3"><p className="text-2xl font-bold text-indigo-600">+{subjectQuizResult.xp_earned}</p><p className="text-xs text-slate-500">XP</p></div>
        </div>
        <div className="mb-4"><div className="h-3 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all" style={{width: `${subjectQuizResult.accuracy}%`}}></div></div><p className="text-sm font-bold text-slate-600 mt-2">{subjectQuizResult.accuracy}% Accuracy</p></div>
        <button onClick={() => { setSubjectQuizResult(null); switchView('subjects'); }} className="gradient-btn py-3 px-8 rounded-2xl font-bold">Continue</button>
      </div>
    )}

    {/* Sentence Practice Modal */}
    {sentencePractice && (<div className="fixed inset-0 z-50 overflow-y-auto" style={{background:'#f1f5f9'}}><div className="p-4 pb-20 max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6 pt-4">
        <button onClick={()=>setSentencePractice(null)} className="flex items-center gap-1 text-slate-500 font-bold text-sm">← Close</button>
        <div className="font-bold text-slate-800">Sentence Practice</div>
        <div className="text-sm font-black text-indigo-600">{sentencePractice.idx+1}/{sentencePractice.items.length}</div>
      </div>
      {(() => { const sq = sentencePractice.items[sentencePractice.idx]; const shuffled = sq.shuffledWords || sq.words; const usedIdxs = sentencePractice.answer.map(a=>a.idx);
        const checkSentPractice = () => {
          const userStr = sentencePractice.answer.map(a=>a.word).join(' ');
          const isCorrect = userStr.toLowerCase() === sq.correct_sentence.toLowerCase();
          setSentencePractice({...sentencePractice, fb: isCorrect ? 'correct' : 'wrong'});
          setTimeout(()=>{
            if(sentencePractice.idx < sentencePractice.items.length-1) {
              const nextIdx = sentencePractice.idx+1;
              const nextItems = [...sentencePractice.items];
              nextItems[nextIdx] = { ...nextItems[nextIdx], shuffledWords: nextItems[nextIdx].words.slice().sort(() => 0.5 - Math.random()) };
              setSentencePractice({...sentencePractice, items: nextItems, idx: nextIdx, answer:[], fb:null});
            }
            else { setSentencePractice(null); alert('Sentence practice complete!'); }
          }, 1000);
        };
        return (<div className="card p-6 slide-up">
          <p className="text-sm text-slate-500 font-medium mb-4 text-center">Arrange the words correctly</p>
          <div className={`answer-area mb-6 ${sentencePractice.fb==='correct'?'correct':sentencePractice.fb==='wrong'?'wrong':''}`}>
            {sentencePractice.answer.length===0 && <span className="text-slate-400 text-sm">Tap words below...</span>}
            {sentencePractice.answer.map((a,i)=><button key={i} className="answer-word" onClick={()=>{if(!sentencePractice.fb) setSentencePractice({...sentencePractice, answer: sentencePractice.answer.filter((_,j)=>j!==i)})}}>{a.word}</button>)}
          </div>
          <div className="word-pool">
            {shuffled.map((w,i)=><button key={i} disabled={usedIdxs.includes(i)||!!sentencePractice.fb} className={`word-btn ${usedIdxs.includes(i)?'used':''}`} onClick={()=>setSentencePractice({...sentencePractice, answer:[...sentencePractice.answer, {idx:i, word:w}]})}>{w}</button>)}
          </div>
          <button disabled={sentencePractice.answer.length===0||!!sentencePractice.fb} onClick={checkSentPractice} className="w-full gradient-btn py-4 rounded-2xl font-bold text-lg mt-4 disabled:opacity-50">Check ✓</button>
        </div>);
      })()}
    </div></div>)}

    </DashboardLayout>
  );
}
