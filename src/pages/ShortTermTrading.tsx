import { useIndodaxData } from '@/hooks/useIndodaxData';
import { TradingPageLayout } from '@/components/dashboard/TradingPageLayout';
import { Zap } from 'lucide-react';

const DEFAULT_SHORT_TERM_COINS = ['USDT', 'BTC', 'ETH', 'XRP', 'SOL', 'DOGE', 'BNB', 'ADA', 'AVAX', 'MATIC', 'LINK', 'DOT'];

export default function ShortTermTrading() {
  const { allCoins, loading, error, lastUpdate, refetch } = useIndodaxData();
  return (
    <TradingPageLayout
      mode="short-term"
      defaultCoins={DEFAULT_SHORT_TERM_COINS}
      defaultIndicators={['swing-trading']}
      title="Trading Jangka Pendek"
      subtitle="Swing Trading 15m"
      icon={<Zap className="h-4 w-4 text-warning" />}
      tpPct={3}
      slPct={2}
      autoStrategy="swing-short-term"
      allCoins={allCoins}
      loading={loading}
      error={error}
      lastUpdate={lastUpdate}
      refetch={refetch}
    />
  );
}
