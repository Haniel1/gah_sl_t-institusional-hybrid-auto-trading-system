import { useIndodaxData } from '@/hooks/useIndodaxData';
import { TradingPageLayout } from '@/components/dashboard/TradingPageLayout';
import { Bot } from 'lucide-react';

const DEFAULT_TRADING_COINS = ['BTC', 'ETH', 'SOL', 'BNB', 'LINK', 'ICP'];

export default function AutoTradingPage() {
  const { allCoins, loading, error, lastUpdate, refetch } = useIndodaxData();
  return (
    <TradingPageLayout
      mode="short-term"
      defaultCoins={DEFAULT_TRADING_COINS}
      defaultIndicators={['swing-trading']}
      title="Auto Trading"
      subtitle="Trend Following + Buy Low Sell High"
      icon={<Bot className="h-4 w-4 text-primary" />}
      tpPct={5}
      slPct={3}
      autoStrategy="trend-following"
      allCoins={allCoins}
      loading={loading}
      error={error}
      lastUpdate={lastUpdate}
      refetch={refetch}
    />
  );
}
