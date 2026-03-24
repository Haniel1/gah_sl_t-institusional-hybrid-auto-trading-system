import { useState, useCallback } from 'react';
import { CoinData, WATCHLIST, NotificationLog } from '@/types/crypto';
import { calculateSignal } from '@/utils/signals';
import { formatRupiahFull } from '@/utils/format';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Send, Bell, BellOff, Loader2, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

interface Props {
  coins: CoinData[];
}

function buildSignalMessage(coin: CoinData): string {
  const signal = calculateSignal(coin);
  const actionEmoji = signal.action === 'BUY' ? '🟢' : signal.action === 'SELL' ? '🔴' : '🟡';
  return `${actionEmoji} <b>ALPHA SIMONS ENGINE</b>\n\n` +
    `<b>${coin.symbol}/IDR</b> — ${coin.name}\n` +
    `Sinyal: <b>${signal.action}</b> (${signal.confidence}%)\n` +
    `Harga: ${formatRupiahFull(coin.last)}\n` +
    `TP: ${formatRupiahFull(signal.takeProfit)}\n` +
    `SL: ${formatRupiahFull(signal.stopLoss)}\n\n` +
    signal.reasons.map(r => `• ${r}`).join('\n');
}

export function TelegramCenter({ coins }: Props) {
  const { user } = useAuth();
  const [enabledCoins, setEnabledCoins] = useState<Set<string>>(() => new Set(WATCHLIST));
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [sending, setSending] = useState<string | null>(null);

  const toggleCoin = (symbol: string) => {
    setEnabledCoins(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  };

  const sendSignal = useCallback(async (coin: CoinData) => {
    setSending(coin.symbol);
    const message = buildSignalMessage(coin);
    const signal = calculateSignal(coin);
    let sent = false;
    try {
      const { error } = await supabase.functions.invoke('send-telegram', {
        body: { message, user_id: user?.id },
      });
      sent = !error;
    } catch { sent = false; }

    setLogs(prev => [{
      id: `${Date.now()}-${coin.symbol}`,
      coin: coin.symbol,
      signal: signal.action,
      message,
      timestamp: new Date(),
      sent,
    }, ...prev].slice(0, 50));
    setSending(null);
  }, []);

  const sendAllEnabled = useCallback(async () => {
    const enabled = coins.filter(c => enabledCoins.has(c.symbol) && WATCHLIST.includes(c.symbol));
    for (const coin of enabled) {
      await sendSignal(coin);
    }
  }, [coins, enabledCoins, sendSignal]);

  const watchlistCoins = coins.filter(c => WATCHLIST.includes(c.symbol));

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Telegram Notification Center
          </h3>
        </div>
        <button
          onClick={sendAllEnabled}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-[10px] font-semibold hover:opacity-90 transition-opacity"
        >
          <Send className="h-3 w-3" />
          Kirim Semua Sinyal
        </button>
      </div>

      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
        {watchlistCoins.map(coin => {
          const enabled = enabledCoins.has(coin.symbol);
          return (
            <button
              key={coin.symbol}
              onClick={() => toggleCoin(coin.symbol)}
              className={`flex items-center justify-between px-2 py-1.5 rounded-md text-[10px] font-semibold border transition-all ${
                enabled
                  ? 'bg-primary/10 border-primary/30 text-foreground'
                  : 'bg-muted border-border text-muted-foreground opacity-50'
              }`}
            >
              <span>{coin.symbol}</span>
              {enabled ? <Bell className="h-2.5 w-2.5 text-primary" /> : <BellOff className="h-2.5 w-2.5" />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {watchlistCoins.filter(c => enabledCoins.has(c.symbol)).slice(0, 10).map(coin => {
          const signal = calculateSignal(coin);
          const isSending = sending === coin.symbol;
          return (
            <button
              key={coin.symbol}
              onClick={() => sendSignal(coin)}
              disabled={isSending}
              className="flex items-center gap-1 px-2 py-1 bg-muted border border-border rounded text-[10px] hover:border-primary/30 transition-colors disabled:opacity-50"
            >
              {isSending ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Send className="h-2.5 w-2.5" />}
              <span>{coin.symbol}</span>
              <span className={signal.action === 'BUY' ? 'text-profit' : signal.action === 'SELL' ? 'text-loss' : 'text-warning'}>
                {signal.action}
              </span>
            </button>
          );
        })}
      </div>

      {logs.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <h4 className="text-[10px] text-muted-foreground font-semibold uppercase">Log Notifikasi</h4>
          {logs.map(log => (
            <div key={log.id} className="flex items-center gap-2 text-[10px] px-2 py-1 bg-muted rounded">
              {log.sent ? <CheckCircle2 className="h-3 w-3 text-profit shrink-0" /> : <XCircle className="h-3 w-3 text-loss shrink-0" />}
              <span className="font-semibold text-foreground">{log.coin}</span>
              <span className={log.signal === 'BUY' ? 'text-profit' : log.signal === 'SELL' ? 'text-loss' : 'text-warning'}>{log.signal}</span>
              <span className="text-muted-foreground ml-auto">{log.timestamp.toLocaleTimeString('id-ID')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
