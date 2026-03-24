import { useState, useEffect, useRef } from 'react';
import { Bell, BellPlus, Trash2, ChevronUp, ChevronDown, Plus, Minus, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface PriceAlertsProps {
  pair: string;
  currentPrice: number;
  userId?: string;
}

interface Alert {
  id: string;
  price: number;
  type: 'above' | 'below';
  active: boolean;
  notifyTelegram: boolean;
  createdAt: Date;
}

const QUICK_PCTS = [5, 10, 15, 20, 25, 50];

const sendTelegramAlert = async (message: string, userId?: string) => {
  try {
    await supabase.functions.invoke('send-telegram', {
      body: { message, user_id: userId },
    });
  } catch (err) {
    console.error('Telegram alert failed:', err);
  }
};

export default function PriceAlerts({ pair, currentPrice }: PriceAlertsProps) {
  const { user } = useAuth();
  const symbol = pair.replace('_idr', '').toUpperCase();
  const storageKey = `alerts_${pair}`;

  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [inputPrice, setInputPrice] = useState('');
  const [telegramEnabled, setTelegramEnabled] = useState(true);
  const triggeredRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(alerts));
  }, [alerts, storageKey]);

  useEffect(() => {
    if (!currentPrice) return;
    alerts.forEach(alert => {
      if (!alert.active || triggeredRef.current.has(alert.id)) return;
      const triggered =
        (alert.type === 'above' && currentPrice >= alert.price) ||
        (alert.type === 'below' && currentPrice <= alert.price);
      if (triggered) {
        triggeredRef.current.add(alert.id);
        const msg = `🔔 Alert ${symbol}: Harga ${alert.type === 'above' ? 'naik di atas' : 'turun di bawah'} Rp ${alert.price.toLocaleString('id-ID')}! (Sekarang: Rp ${currentPrice.toLocaleString('id-ID')})`;
        toast.success(msg);
        if (alert.notifyTelegram) {
          sendTelegramAlert(`<b>🔔 Price Alert Triggered</b>\n\n💰 <b>${symbol}/IDR</b>\n${alert.type === 'above' ? '📈 Harga naik di atas' : '📉 Harga turun di bawah'} <b>Rp ${alert.price.toLocaleString('id-ID')}</b>\n💵 Harga sekarang: <b>Rp ${currentPrice.toLocaleString('id-ID')}</b>`, user?.id);
        }
        setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, active: false } : a));
      }
    });
  }, [currentPrice, alerts, symbol]);

  const addAlertAt = (price: number, type: 'above' | 'below') => {
    if (!price || price <= 0) { toast.error('Masukkan harga valid'); return; }
    const newAlert: Alert = {
      id: Date.now().toString() + Math.random(),
      price,
      type,
      active: true,
      notifyTelegram: telegramEnabled,
      createdAt: new Date(),
    };
    setAlerts(prev => [...prev, newAlert]);
    toast.success(`Alert ditambahkan: ${type === 'above' ? '↑' : '↓'} Rp ${price.toLocaleString('id-ID')}`);
  };

  const addAlert = (type: 'above' | 'below') => {
    const price = Number(inputPrice);
    addAlertAt(price, type);
    setInputPrice('');
  };

  const addQuickAlert = (pct: number, direction: 'above' | 'below') => {
    if (!currentPrice) { toast.error('Harga belum tersedia'); return; }
    const price = direction === 'above'
      ? Math.round(currentPrice * (1 + pct / 100))
      : Math.round(currentPrice * (1 - pct / 100));
    addAlertAt(price, direction);
  };

  const removeAlert = (id: string) => {
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-primary" />
          <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">Price Alerts</span>
        </div>
        <button
          onClick={() => setTelegramEnabled(prev => !prev)}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-colors ${
            telegramEnabled
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-muted text-muted-foreground border border-border'
          }`}
          title={telegramEnabled ? 'Telegram ON' : 'Telegram OFF'}
        >
          <Send className="w-2.5 h-2.5" />
          {telegramEnabled ? 'TG ON' : 'TG OFF'}
        </button>
      </div>

      {/* Manual input */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            value={inputPrice}
            onChange={e => setInputPrice(e.target.value)}
            placeholder={`Harga ${symbol}...`}
            className="flex-1 bg-muted border border-border rounded px-2 py-1.5 text-[10px] font-mono text-foreground placeholder-muted-foreground outline-none focus:border-primary"
          />
          <button onClick={() => addAlert('above')} className="p-1.5 rounded bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25 transition-colors" title="Alert naik di atas">
            <ChevronUp className="w-3 h-3" />
          </button>
          <button onClick={() => addAlert('below')} className="p-1.5 rounded bg-loss/15 text-loss border border-loss/30 hover:bg-loss/25 transition-colors" title="Alert turun di bawah">
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Quick % alerts */}
      {currentPrice > 0 && (
        <div className="px-3 py-2 border-b border-border space-y-1.5">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Quick Alert dari harga sekarang (Rp {currentPrice.toLocaleString('id-ID')})</span>
          <div className="grid grid-cols-3 gap-1">
            {QUICK_PCTS.map(pct => (
              <div key={pct} className="flex gap-0.5">
                <button
                  onClick={() => addQuickAlert(pct, 'above')}
                  className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-bold bg-profit/10 text-profit border border-profit/20 hover:bg-profit/20 transition-colors"
                  title={`+${pct}% = Rp ${Math.round(currentPrice * (1 + pct / 100)).toLocaleString('id-ID')}`}
                >
                  <Plus className="w-2.5 h-2.5" />{pct}%
                </button>
                <button
                  onClick={() => addQuickAlert(pct, 'below')}
                  className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-bold bg-loss/10 text-loss border border-loss/20 hover:bg-loss/20 transition-colors"
                  title={`-${pct}% = Rp ${Math.round(currentPrice * (1 - pct / 100)).toLocaleString('id-ID')}`}
                >
                  <Minus className="w-2.5 h-2.5" />{pct}%
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alert List */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {alerts.length === 0 ? (
          <div className="px-3 py-6 text-center">
            <BellPlus className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
            <p className="text-[10px] text-muted-foreground">Belum ada alert</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className={`flex items-center justify-between px-3 py-2 border-b border-border/30 ${!alert.active ? 'opacity-40' : ''}`}>
              <div className="flex items-center gap-2">
                {alert.type === 'above' ? (
                  <ChevronUp className="w-3 h-3 text-profit" />
                ) : (
                  <ChevronDown className="w-3 h-3 text-loss" />
                )}
                <div>
                  <span className="text-[10px] font-mono font-semibold text-foreground">
                    Rp {alert.price.toLocaleString('id-ID')}
                  </span>
                  {currentPrice > 0 && alert.active && (
                    <span className={`text-[9px] ml-1 ${alert.type === 'above' ? 'text-profit' : 'text-loss'}`}>
                      ({((alert.price - currentPrice) / currentPrice * 100).toFixed(1)}%)
                    </span>
                  )}
                  <span className={`text-[9px] ml-1.5 ${alert.active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {alert.active ? '● aktif' : '○ triggered'}
                  </span>
                  {alert.notifyTelegram && (
                    <Send className="w-2.5 h-2.5 inline ml-1 text-primary/60" />
                  )}
                </div>
              </div>
              <button onClick={() => removeAlert(alert.id)} className="p-1 hover:bg-muted rounded transition-colors">
                <Trash2 className="w-3 h-3 text-muted-foreground hover:text-loss" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}