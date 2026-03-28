import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Bell, CheckCircle2, Loader2, UserPlus, Users, Trash2, LogOut, KeyRound, Monitor } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useIndodaxTickers } from '@/hooks/useIndodax';
import { useAuth } from '@/contexts/AuthContext';

type NotifyMode = 'single' | 'selected' | 'all';
type Platform = 'indodax' | 'okx';

interface TradingUser {
  id: string;
  name: string;
  username: string;
  is_active: boolean;
  created_at: string;
  platform?: string;
}

export default function Settings() {
  const { user, logout } = useAuth();
  const [notifyMode, setNotifyMode] = useState<NotifyMode>('all');
  const [selectedPairs, setSelectedPairs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const { tickers } = useIndodaxTickers();

  // User management
  const [users, setUsers] = useState<TradingUser[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('indodax');
  const [newUser, setNewUser] = useState({
    name: '', username: '', password: '', platform: 'indodax' as Platform,
    indodax_api_key: '', indodax_secret: '',
    okx_api_key: '', okx_secret: '', okx_passphrase: '',
    telegram_bot_token: '', telegram_chat_id: '',
  });
  const [addingUser, setAddingUser] = useState(false);
  const [userError, setUserError] = useState('');

  // Change password
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [pwForm, setPwForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [changingPw, setChangingPw] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('app_settings').select('*').single();
      if (data) {
        setNotifyMode(data.telegram_notify_mode as NotifyMode);
        setSelectedPairs(data.selected_notify_pairs || []);
      }
    };
    load();
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    try {
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/user-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    await supabase
      .from('app_settings')
      .update({
        telegram_notify_mode: notifyMode,
        selected_notify_pairs: selectedPairs,
      })
      .not('id', 'is', null);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testTelegram = async () => {
    setTestingTelegram(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      await fetch(`https://${projectId}.supabase.co/functions/v1/telegram-notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '🤖 <b>Test Notification</b>\nGainzHalving Trading Bot berhasil terhubung!' }),
      });
    } catch (err) {
      console.error('Telegram test failed:', err);
    }
    setTestingTelegram(false);
  };

  const togglePair = (pair: string) => {
    setSelectedPairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair]
    );
  };

  const addUser = async () => {
    setUserError('');
    if (!newUser.name || !newUser.username || !newUser.password) {
      setUserError('Nama, username, dan password wajib diisi');
      return;
    }
    setAddingUser(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/user-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', ...newUser }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setUserError(data.error || 'Gagal menambah user');
      } else {
        setNewUser({
          name: '', username: '', password: '', platform: 'indodax',
          indodax_api_key: '', indodax_secret: '',
          okx_api_key: '', okx_secret: '', okx_passphrase: '',
          telegram_bot_token: '', telegram_chat_id: '',
        });
        setShowAddUser(false);
        loadUsers();
      }
    } catch (err: any) {
      setUserError(err.message);
    }
    setAddingUser(false);
  };

  const deleteUser = async (userId: string) => {
    if (userId === user?.id) return;
    if (!confirm('Hapus user ini?')) return;
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    await fetch(`https://${projectId}.supabase.co/functions/v1/user-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', user_id: userId }),
    });
    loadUsers();
  };

  const changePassword = async () => {
    setPwError('');
    setPwSuccess(false);
    if (!pwForm.old_password || !pwForm.new_password) {
      setPwError('Semua field wajib diisi');
      return;
    }
    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwError('Konfirmasi password tidak cocok');
      return;
    }
    if (pwForm.new_password.length < 4) {
      setPwError('Password baru minimal 4 karakter');
      return;
    }
    setChangingPw(true);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(`https://${projectId}.supabase.co/functions/v1/user-auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'change_password', user_id: user?.id, old_password: pwForm.old_password, new_password: pwForm.new_password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPwError(data.error || 'Gagal mengubah password');
      } else {
        setPwSuccess(true);
        setPwForm({ old_password: '', new_password: '', confirm_password: '' });
        setTimeout(() => { setPwSuccess(false); setShowChangePassword(false); }, 2000);
      }
    } catch (err: any) {
      setPwError(err.message);
    }
    setChangingPw(false);
  };

  const inputClass = "w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-primary/50";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8">
          <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Settings</h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">{user?.name}</span>
            <button onClick={logout} className="text-muted-foreground hover:text-loss transition-colors p-1" title="Logout">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="terminal-card p-3 sm:p-4 mb-4 sm:mb-6 border-terminal-yellow/30">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-terminal-yellow shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-terminal-yellow">Credentials Tersimpan Aman</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                API Key dan Secret tersimpan sebagai Cloud Secrets (terenkripsi). 
                Hanya bisa diakses oleh Edge Functions di server, tidak pernah terekspos ke browser.
              </p>
            </div>
          </div>
        </div>

        {/* User Management */}
        <section className="terminal-card p-3 sm:p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm text-foreground">Manajemen User</h2>
            </div>
            <button
              onClick={() => setShowAddUser(!showAddUser)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Tambah User
            </button>
          </div>

          {/* User list */}
          <div className="space-y-2 mb-3">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2.5 rounded-md bg-muted/50 border border-border">
                <div>
                  <p className="text-xs font-medium text-foreground">{u.name}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground font-mono">@{u.username}</p>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground font-mono uppercase">
                      {u.platform || 'indodax'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${u.is_active ? 'bg-profit/20 text-profit' : 'bg-loss/20 text-loss'}`}>
                    {u.is_active ? 'Aktif' : 'Nonaktif'}
                  </span>
                  {u.id !== user?.id && (
                    <button onClick={() => deleteUser(u.id)} className="text-muted-foreground hover:text-loss transition-colors p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add User Form */}
          {showAddUser && (
            <div className="border border-primary/20 rounded-md p-3 sm:p-4 space-y-3 bg-primary/5">
              <h3 className="text-xs font-semibold text-foreground">Tambah User Baru</h3>
              
              {userError && (
                <div className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-md p-2">{userError}</div>
              )}

              {/* Platform Selection */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block font-semibold uppercase tracking-wider">Platform Trading</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { id: 'indodax' as Platform, name: 'Indodax', desc: 'Crypto exchange Indonesia', icon: '🇮🇩' },
                    { id: 'okx' as Platform, name: 'OKX (TradingView)', desc: 'Global exchange + TradingView', icon: '🌐' },
                  ]).map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPlatform(p.id);
                        setNewUser(prev => ({ ...prev, platform: p.id }));
                      }}
                      className={`flex items-center gap-2 p-2.5 rounded-md border text-left transition-all ${
                        selectedPlatform === p.id
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'border-border text-muted-foreground hover:border-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-lg">{p.icon}</span>
                      <div>
                        <p className="text-xs font-bold">{p.name}</p>
                        <p className="text-[9px] opacity-70">{p.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Nama *</label>
                  <input type="text" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))}
                    className={inputClass} placeholder="Nama lengkap" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block">Username *</label>
                  <input type="text" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))}
                    className={inputClass} placeholder="Username" />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Password *</label>
                <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  className={inputClass} placeholder="Password" />
              </div>

              {/* Platform-specific credentials */}
              <div className="border-t border-border pt-3 mt-2">
                <p className="text-[10px] text-muted-foreground mb-2 font-semibold flex items-center gap-1.5">
                  <Monitor className="w-3 h-3" />
                  Kredensial {selectedPlatform === 'indodax' ? 'Indodax' : 'OKX'} (opsional, bisa diisi nanti)
                </p>

                {selectedPlatform === 'indodax' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Indodax API Key</label>
                      <input type="text" value={newUser.indodax_api_key} onChange={e => setNewUser(p => ({ ...p, indodax_api_key: e.target.value }))}
                        className={inputClass} placeholder="API Key" />
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">Indodax Secret</label>
                      <input type="password" value={newUser.indodax_secret} onChange={e => setNewUser(p => ({ ...p, indodax_secret: e.target.value }))}
                        className={inputClass} placeholder="Secret Key" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">OKX API Key</label>
                        <input type="text" value={newUser.okx_api_key} onChange={e => setNewUser(p => ({ ...p, okx_api_key: e.target.value }))}
                          className={inputClass} placeholder="API Key dari OKX" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground mb-1 block">OKX Secret Key</label>
                        <input type="password" value={newUser.okx_secret} onChange={e => setNewUser(p => ({ ...p, okx_secret: e.target.value }))}
                          className={inputClass} placeholder="Secret Key" />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] text-muted-foreground mb-1 block">OKX Passphrase</label>
                      <input type="password" value={newUser.okx_passphrase} onChange={e => setNewUser(p => ({ ...p, okx_passphrase: e.target.value }))}
                        className={inputClass} placeholder="Passphrase dari OKX API" />
                    </div>
                    <div className="bg-muted/50 border border-border rounded-md p-2.5">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">
                        💡 <strong>Cara mendapatkan API OKX:</strong> Login ke OKX → Settings → API → Create API Key. 
                        Pastikan aktifkan permission <code className="text-primary">Trade</code> dan <code className="text-primary">Read</code>. 
                        Simpan Passphrase yang Anda buat saat membuat API Key.
                      </p>
                    </div>
                  </div>
                )}

                {/* Telegram (shared) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Telegram Bot Token</label>
                    <input type="text" value={newUser.telegram_bot_token} onChange={e => setNewUser(p => ({ ...p, telegram_bot_token: e.target.value }))}
                      className={inputClass} placeholder="Bot Token" />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">Telegram Chat ID</label>
                    <input type="text" value={newUser.telegram_chat_id} onChange={e => setNewUser(p => ({ ...p, telegram_chat_id: e.target.value }))}
                      className={inputClass} placeholder="Chat ID" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={addUser} disabled={addingUser}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-xs py-2 rounded-md hover:opacity-90 transition-opacity">
                  {addingUser && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Simpan User
                </button>
                <button onClick={() => { setShowAddUser(false); setUserError(''); }}
                  className="px-4 py-2 text-xs text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors">
                  Batal
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Change Password */}
        <section className="terminal-card p-3 sm:p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-sm text-foreground">Ganti Password</h2>
            </div>
            <button onClick={() => { setShowChangePassword(!showChangePassword); setPwError(''); setPwSuccess(false); }}
              className="text-xs text-primary hover:underline">
              {showChangePassword ? 'Tutup' : 'Ubah'}
            </button>
          </div>
          {showChangePassword && (
            <div className="space-y-3">
              {pwError && <div className="text-xs text-loss bg-loss/10 border border-loss/20 rounded-md p-2">{pwError}</div>}
              {pwSuccess && (
                <div className="text-xs text-profit bg-profit/10 border border-profit/20 rounded-md p-2 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Password berhasil diubah
                </div>
              )}
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Password Lama</label>
                <input type="password" value={pwForm.old_password} onChange={e => setPwForm(p => ({ ...p, old_password: e.target.value }))}
                  className={inputClass} placeholder="Password saat ini" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Password Baru</label>
                <input type="password" value={pwForm.new_password} onChange={e => setPwForm(p => ({ ...p, new_password: e.target.value }))}
                  className={inputClass} placeholder="Password baru" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block">Konfirmasi Password Baru</label>
                <input type="password" value={pwForm.confirm_password} onChange={e => setPwForm(p => ({ ...p, confirm_password: e.target.value }))}
                  className={inputClass} placeholder="Ulangi password baru" />
              </div>
              <button onClick={changePassword} disabled={changingPw}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-xs py-2 rounded-md hover:opacity-90 transition-opacity disabled:opacity-50">
                {changingPw && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Simpan Password Baru
              </button>
            </div>
          )}
        </section>

        {/* Status */}
        <section className="terminal-card p-3 sm:p-4 mb-4">
          <h2 className="font-semibold text-sm text-foreground mb-3">Status Koneksi</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-profit" />
              <span className="text-foreground">Indodax API</span>
              <span className="text-muted-foreground ml-auto">Terhubung</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-muted-foreground" />
              <span className="text-foreground">OKX API</span>
              <span className="text-muted-foreground ml-auto">Belum dikonfigurasi</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-profit" />
              <span className="text-foreground">Telegram Bot</span>
              <span className="text-muted-foreground ml-auto">Terhubung</span>
            </div>
          </div>
          <button onClick={testTelegram} disabled={testingTelegram}
            className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-md text-xs bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
            {testingTelegram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
            Test Telegram Notification
          </button>
        </section>

        {/* Notification Preferences */}
        <section className="terminal-card p-3 sm:p-4 mb-4">
          <h2 className="font-semibold text-sm text-foreground mb-3">Notification Scope</h2>
          <div className="space-y-2 mb-4">
            {([
              { value: 'all', label: 'Semua Koin', desc: 'Notifikasi untuk semua koin yang di-trade' },
              { value: 'selected', label: 'Koin Terpilih', desc: 'Pilih koin mana yang akan dinotifikasi' },
              { value: 'single', label: 'Satu Koin Saja', desc: 'Notifikasi hanya untuk satu koin' },
            ] as const).map(opt => (
              <label key={opt.value} className={`flex items-start gap-3 p-2.5 rounded-md cursor-pointer transition-colors ${
                notifyMode === opt.value ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted border border-transparent'
              }`}>
                <input type="radio" name="notif-scope" checked={notifyMode === opt.value}
                  onChange={() => setNotifyMode(opt.value)} className="accent-primary mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-foreground">{opt.label}</p>
                  <p className="text-[10px] text-muted-foreground">{opt.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {notifyMode === 'selected' && tickers.length > 0 && (
            <div className="border border-border rounded-md p-3 max-h-48 overflow-y-auto scrollbar-thin">
              <p className="text-[10px] text-muted-foreground mb-2">Pilih koin untuk notifikasi:</p>
              <div className="grid grid-cols-3 gap-1.5">
                {tickers.slice(0, 30).map(t => {
                  const sym = t.pair.replace('_idr', '').toUpperCase();
                  const isSelected = selectedPairs.includes(t.pair);
                  return (
                    <button key={t.pair} onClick={() => togglePair(t.pair)}
                      className={`px-2 py-1.5 rounded text-[10px] font-mono transition-colors ${
                        isSelected
                          ? 'bg-primary/20 text-primary border border-primary/30'
                          : 'bg-muted text-muted-foreground border border-border hover:border-muted-foreground'
                      }`}>
                      {sym}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <button onClick={saveSettings} disabled={saving}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold text-sm py-2.5 rounded-md hover:opacity-90 transition-opacity">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? 'Tersimpan!' : 'Simpan Settings'}
        </button>
      </div>
    </div>
  );
}