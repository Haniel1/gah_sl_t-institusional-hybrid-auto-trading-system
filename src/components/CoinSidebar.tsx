import { useState } from 'react';
import { Search, TrendingUp, TrendingDown, Activity, ChevronDown, ChevronUp } from 'lucide-react';
import { useIndodaxTickers, formatIDR, type CoinTicker } from '@/hooks/useIndodax';
import { useIsMobile } from '@/hooks/use-mobile';
import { TimePredictionPanel } from '@/components/dashboard/TimePredictionPanel';

interface CoinSidebarProps {
  selectedPair: string;
  onSelectPair: (pair: string) => void;
}

export default function CoinSidebar({ selectedPair, onSelectPair }: CoinSidebarProps) {
  const { tickers, loading } = useIndodaxTickers();
  const [search, setSearch] = useState('');
  const isMobile = useIsMobile();
  const [mobileExpanded, setMobileExpanded] = useState(false);

  const filtered = tickers.filter(t =>
    t.pair.toLowerCase().includes(search.toLowerCase()) ||
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const selectedTicker = tickers.find(t => t.pair === selectedPair);
  const selectedSymbol = selectedPair.replace('_idr', '').toUpperCase();

  // Mobile: collapsed horizontal bar with expand toggle
  if (isMobile) {
    return (
      <div className="border-b border-border bg-sidebar">
        {/* Collapsed bar: shows selected coin + toggle */}
        <button
          onClick={() => setMobileExpanded(!mobileExpanded)}
          className="w-full flex items-center justify-between px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="font-semibold text-xs text-foreground">{selectedSymbol}/IDR</span>
            {selectedTicker && (
              <>
                <span className="font-mono text-xs text-foreground">{formatIDR(selectedTicker.last)}</span>
                <span className={`text-[10px] font-mono ${selectedTicker.change >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {selectedTicker.change >= 0 ? '+' : ''}{selectedTicker.change.toFixed(2)}%
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span className="text-[10px]">{tickers.length} pairs</span>
            {mobileExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        {/* Expanded: search + scrollable list */}
        {mobileExpanded && (
          <div className="border-t border-border">
            <div className="p-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search coins..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-muted border border-border rounded-md pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto scrollbar-thin">
              {filtered.map(ticker => (
                <CoinRow
                  key={ticker.pair}
                  ticker={ticker}
                  selected={selectedPair === ticker.pair}
                  onClick={() => { onSelectPair(ticker.pair); setMobileExpanded(false); }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Desktop: full vertical sidebar
  return (
    <aside className="w-72 border-r border-border bg-sidebar flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-sm text-foreground">Markets</h2>
          <span className="ml-auto text-xs text-muted-foreground font-mono">{tickers.length} pairs</span>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search coins..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-muted border border-border rounded-md pl-8 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : (
          filtered.map(ticker => (
            <CoinRow
              key={ticker.pair}
              ticker={ticker}
              selected={selectedPair === ticker.pair}
              onClick={() => onSelectPair(ticker.pair)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function CoinRow({ ticker, selected, onClick }: { ticker: CoinTicker; selected: boolean; onClick: () => void }) {
  const isUp = ticker.change >= 0;
  const symbol = ticker.pair.replace('_idr', '').toUpperCase();

  return (
    <button
      onClick={onClick}
      className={`w-full px-3 py-2.5 flex items-center gap-3 border-b border-border/50 transition-colors text-left hover:bg-muted/50 ${selected ? 'bg-muted/80 border-l-2 border-l-primary' : ''}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-xs text-foreground">{symbol}</span>
          <span className="text-[10px] text-muted-foreground">/IDR</span>
        </div>
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] text-muted-foreground truncate">{ticker.name}</p>
          <TimePredictionPanel symbol={symbol} compact />
        </div>
      </div>
      <div className="text-right">
        <p className="font-mono text-xs text-foreground">{formatIDR(ticker.last)}</p>
        <div className={`flex items-center justify-end gap-0.5 text-[10px] font-mono ${isUp ? 'text-profit' : 'text-loss'}`}>
          {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isUp ? '+' : ''}{ticker.change.toFixed(2)}%
        </div>
      </div>
    </button>
  );
}
