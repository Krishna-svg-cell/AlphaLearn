'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { LogIn, Eye, EyeOff, BookOpen, Zap, Star } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    if (token && role) window.location.href = `/${role.trim().toLowerCase()}`;
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/api/auth/login', { username, password }, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.user.role.trim());
      window.location.href = `/${res.data.user.role.trim().toLowerCase()}`;
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
      setLoading(false);
    }
  };

  const features = [
    { icon: <Zap size={16} />, text: 'Daily Missions' },
    { icon: <Star size={16} />, text: 'XP & Streaks' },
    { icon: <BookOpen size={16} />, text: 'Smart Learning' },
  ];

  return (
    <div className="min-h-screen flex items-stretch" style={{ background: '#0f172a' }}>
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex flex-col justify-between w-[45%] p-12 relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #a855f7 100%)' }}>
        {/* Decorative circles */}
        <div className="absolute top-[-80px] right-[-80px] w-[300px] h-[300px] rounded-full opacity-20"
          style={{ background: 'white' }} />
        <div className="absolute bottom-[-60px] left-[-60px] w-[250px] h-[250px] rounded-full opacity-10"
          style={{ background: 'white' }} />
        <div className="absolute top-[40%] right-[10%] w-[120px] h-[120px] rounded-full opacity-10"
          style={{ background: 'white' }} />

        {/* Brand */}
        <div className="relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mb-6 border border-white/30">
            <span className="text-white font-black text-xl">A</span>
          </div>
          <h1 className="text-4xl font-black text-white tracking-tight mb-2">ALPHALEARN</h1>
          <p className="text-indigo-200 text-lg font-medium">Your daily mission starts here.</p>
        </div>

        {/* Features */}
        <div className="relative z-10 space-y-4">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white border border-white/20">
                {f.icon}
              </div>
              <span className="text-white font-semibold">{f.text}</span>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="relative z-10 text-indigo-300 text-sm">© 2025 AlphaLearn EdTech</p>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 flex items-center justify-center p-6" style={{ background: '#f8fafc' }}>
        <div className="w-full max-w-md slide-up">
          {/* Mobile brand */}
          <div className="lg:hidden text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mx-auto mb-4 shadow-lg">
              <span className="text-white font-black text-2xl">A</span>
            </div>
            <h1 className="text-3xl font-black bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }}>
              ALPHALEARN
            </h1>
            <p className="text-slate-500 mt-1 font-medium">Your daily mission starts here.</p>
          </div>

          {/* Card */}
          <div className="card p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-black text-slate-900">Welcome back</h2>
              <p className="text-slate-500 mt-1">Sign in to continue your learning journey</p>
            </div>

            {error && (
              <div className="mb-6 px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 fade-in"
                style={{ background: '#fff1f2', color: '#e11d48', border: '1.5px solid #fecdd3' }}>
                <span>⚠️</span> {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Username</label>
                <input
                  type="text"
                  className="al-input"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    className="al-input"
                    style={{ paddingRight: '48px' }}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="btn btn-primary btn-full btn-lg" style={{ marginTop: '8px' }}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="loading-spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <LogIn size={20} /> Sign In
                  </span>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Contact your school administrator for access
          </p>
        </div>
      </div>
    </div>
  );
}
