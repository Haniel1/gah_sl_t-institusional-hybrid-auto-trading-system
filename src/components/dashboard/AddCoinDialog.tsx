import { useState, useMemo } from 'react';
import { CoinData, COIN_NAMES } from '@/types/crypto';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Search } from 'lucide-react';
import { formatRupiah, formatVolume } from '@/utils/format';

interface Props {
  coins: CoinData[];
  existingSymbols: string[];
  mode: 'short-term' | 'long-term';
  onAdd: (symbol: string) => void;
}

export function AddCoinDialog({ coins, existingSymbols, mode, onAdd }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const availableCoins = useMemo(() => {
    return coins
      .filter(c => !existingSymbols.includes(c.symbol))
      .filter(c => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.volumeIdr - a.volumeIdr)
      .slice(0, 50);
  }, [coins, existingSymbols, search]);

  const handleAdd = (symbol: string) => {
    onAdd(symbol);
    setOpen(false);
    setSearch('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors">
          <Plus className="h-3 w-3" />
          Tambah Koin
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-sm text-foreground">
            Tambah Koin ke {mode === 'short-term' ? 'Trading Jangka Pendek' : 'Investasi Jangka Panjang'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari koin..."
            className="w-full pl-7 pr-3 py-2 text-xs rounded border border-border bg-background text-foreground"
          />
        </div>
        
        <div className="max-h-64 overflow-y-auto space-y-1">
          {availableCoins.map(coin => (
            <button
              key={coin.id}
              onClick={() => handleAdd(coin.symbol)}
              className="w-full flex items-center justify-between px-3 py-2 rounded hover:bg-muted transition-colors text-left"
            >
              <div>
                <span className="text-xs font-bold text-foreground">{coin.symbol}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{coin.name}</span>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-foreground">{formatRupiah(coin.last)}</div>
                <div className="text-[9px] text-muted-foreground">Vol: {formatVolume(coin.volumeIdr)}</div>
              </div>
            </button>
          ))}
          {availableCoins.length === 0 && (
            <p className="text-center text-[10px] text-muted-foreground py-4">Tidak ada koin tersedia</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
