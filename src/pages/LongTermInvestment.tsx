import { useIndodaxData } from '@/hooks/useIndodaxData';
import { TradingPageLayout } from '@/components/dashboard/TradingPageLayout';
import { PiggyBank } from 'lucide-react';

const DEFAULT_LONG_TERM_COINS = [
  'BTC', 'ETH', 'SOL', 'AAVE', 'ICP', 'PAXG', 'XAUT', 'QNT', 'DOT',
  'LINK', 'UNI', 'BCH', 'WBTC', 'YFI', 'SFI', 'CST',
];

export default function LongTermInvestment() {
  const { allCoins, loading, error, lastUpdate, refetch } = useIndodaxData();
  return (
    <TradingPageLayout
      mode="long-term"
      defaultCoins={DEFAULT_LONG_TERM_COINS}
      defaultIndicators={['swing-trading']}
      title="Investasi Jangka Panjang"
      subtitle="Swing Trading 1h"
      icon={<PiggyBank className="h-4 w-4 text-primary" />}
      tpPct={10}
      slPct={8}
      autoStrategy="swing-long-term"
      allCoins={allCoins}
      loading={loading}
      error={error}
      lastUpdate={lastUpdate}
      refetch={refetch}
    />
  );
}
