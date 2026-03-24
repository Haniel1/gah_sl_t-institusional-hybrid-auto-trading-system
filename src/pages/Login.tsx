import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Lock } from 'lucide-react';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('remember_me_creds');
    if (saved) {
      try {
        const { username: u, password: p } = JSON.parse(saved);
        setUsername(u || '');
        setPassword(p || '');
        setRememberMe(true);
      } catch { /* ignore */ }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(username, password);
    if (!result.success) {
      setError(result.error || 'Login gagal');
    } else {
      if (rememberMe) {
        localStorage.setItem('remember_me_creds', JSON.stringify({ username, password }));
      } else {
        localStorage.removeItem('remember_me_creds');
      }
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-3 h-3 rounded-full bg-profit animate-pulse" />
            <span className="font-mono font-bold text-xl text-primary tracking-wider">GainzHalving</span>
          </div>
          <p className="text-xs text-muted-foreground">Trading Bot Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="terminal-card p-6 space-y-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm text-foreground">Login</h2>
          </div>

          {error && (
            <div className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-md p-2.5">
              {error}
            </div>
          )}

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Username"
              required
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Password"
              required
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-border accent-primary"
            />
            <span className="text-xs text-muted-foreground">Ingat saya</span>
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Logging in...' : 'Masuk'}
          </button>
        </form>
      </div>
    </div>
  );
}
