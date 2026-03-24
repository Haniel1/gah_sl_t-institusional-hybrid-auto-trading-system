import { useEffect, useRef } from 'react';
import type { CandleData } from '@/hooks/useIndodax';
import { calculateGainzAlgo, calculateFabioValentini, getCurrentHalvingPhase } from '@/lib/strategies';
import { supabase } from '@/integrations/supabase/client';

async function isNotifyEnabled(pair: string): Promise<boolean> {
  const { data } = await supabase
    .from('auto_trade_config')
    .select('notify_telegram')
    .eq('pair', pair)
    .single();
  return data?.notify_telegram ?? false;
}

async function sendTelegramNotify(pair: string, type: string, price: number, strategy: string, userId?: string) {
  const enabled = await isNotifyEnabled(pair);
  if (!enabled) return;

  const symbol = pair.replace('_idr', '').toUpperCase();
  const emoji = type === 'buy' ? '🟢 BUY' : '🔴 SELL';
  const message = `${emoji} <b>${symbol}/IDR</b>\n` +
    `💰 Price: Rp ${price.toLocaleString('id-ID')}\n` +
    `📈 Strategy: ${strategy}\n` +
    `🕐 ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

  try {
    await supabase.functions.invoke('send-telegram', {
      body: { message, user_id: userId },
    });
  } catch (err) {
    console.error('Failed to send Telegram notification:', err);
  }
}

export function useSignalNotifier(pair: string, strategy: string, candles: CandleData[], userId?: string) {
  const lastNotifiedRef = useRef<string>('');

  useEffect(() => {
    if (candles.length === 0) return;

    let signals: { time: number; type: string; poc?: number }[] = [];

    if (strategy === 'gainzalgo') {
      signals = calculateGainzAlgo(candles);
    } else if (strategy === 'fabio') {
      signals = calculateFabioValentini(candles);
    } else if (strategy === 'halving') {
      const phase = getCurrentHalvingPhase();
      if (!phase) return;
      const phaseKey = `halving-${phase.phase}-${pair}`;
      if (lastNotifiedRef.current !== phaseKey) {
        lastNotifiedRef.current = phaseKey;
        const lastCandle = candles[candles.length - 1];
        const type = phase.phase.includes('Profit') ? 'sell' : 'buy';
        sendTelegramNotify(pair, type, lastCandle.close, `Halving Cycle (${phase.phase})`, userId);
      }
      return;
    }

    if (signals.length === 0) return;

    const lastSignal = signals[signals.length - 1];
    const signalKey = `${pair}-${strategy}-${lastSignal.time}-${lastSignal.type}`;

    if (lastNotifiedRef.current !== signalKey) {
      lastNotifiedRef.current = signalKey;
      const candle = candles.find(c => c.time === lastSignal.time);
      const price = candle?.close || 0;
      sendTelegramNotify(pair, lastSignal.type, price, strategy, userId);
    }
  }, [candles, strategy, pair, userId]);
}
