import { CoinData, Signal } from '@/types/crypto';

export function calculateIndicators(coin: CoinData) {
  const range = coin.high - coin.low;
  const position = range > 0 ? (coin.last - coin.low) / range : 0.5;
  const rsi = position * 100;
  const midpoint = (coin.high + coin.low) / 2;
  const macd = midpoint > 0 ? ((coin.last - midpoint) / midpoint) * 100 : 0;
  const zScore = (position - 0.5) * 4;
  return { rsi, macd, zScore, position };
}

export function calculateSignal(coin: CoinData): Signal {
  const { rsi, macd, zScore } = calculateIndicators(coin);

  let score = 50;
  const reasons: string[] = [];

  if (rsi < 25) { score += 18; reasons.push('RSI sangat oversold'); }
  else if (rsi < 40) { score += 10; reasons.push('RSI mendekati oversold'); }
  else if (rsi > 80) { score -= 18; reasons.push('RSI sangat overbought'); }
  else if (rsi > 65) { score -= 8; reasons.push('RSI tinggi'); }

  if (coin.change24h > 8) { score += 5; reasons.push('Momentum sangat kuat'); }
  else if (coin.change24h > 3) { score += 8; reasons.push('Tren naik positif'); }
  else if (coin.change24h > 0) { score += 3; reasons.push('Tren positif ringan'); }
  else if (coin.change24h < -8) { score -= 5; reasons.push('Crash - tunggu konfirmasi'); }
  else if (coin.change24h < -3) { score -= 10; reasons.push('Tekanan jual kuat'); }
  else if (coin.change24h < 0) { score -= 3; reasons.push('Koreksi ringan'); }

  if (zScore < -1.5) { score += 14; reasons.push('Anomali Simons: Harga sangat murah secara statistik'); }
  else if (zScore < -0.8) { score += 6; reasons.push('Simons: Di bawah rata-rata'); }
  else if (zScore > 1.5) { score -= 14; reasons.push('Anomali Simons: Harga sangat mahal secara statistik'); }
  else if (zScore > 0.8) { score -= 6; reasons.push('Simons: Di atas rata-rata'); }

  const spread = coin.last > 0 ? ((coin.sell - coin.buy) / coin.last) * 100 : 0;
  if (spread < 0.3) { score += 4; reasons.push('Likuiditas sangat tinggi'); }
  else if (spread > 2) { score -= 6; reasons.push('Spread lebar - risiko tinggi'); }

  const confidence = Math.min(100, Math.max(0, score));
  let action: 'BUY' | 'SELL' | 'HOLD';
  if (confidence >= 62) action = 'BUY';
  else if (confidence <= 38) action = 'SELL';
  else action = 'HOLD';

  const tpMultiplier = action === 'BUY' ? 1.05 : action === 'SELL' ? 0.97 : 1.02;
  const slMultiplier = action === 'BUY' ? 0.97 : action === 'SELL' ? 1.03 : 0.98;

  return {
    action,
    confidence,
    reasons,
    takeProfit: coin.last * tpMultiplier,
    stopLoss: coin.last * slMultiplier,
    rsi,
    macd,
    zScore,
  };
}
