import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Plus, X } from 'lucide-react';

interface AddCoinDialogProps {
  onAdded: () => void;
  existingSymbols: string[];
}

const POPULAR_OKX_COINS = [
  'BTCUSDT.P', 'ETHUSDT.P', 'SOLUSDT.P', 'DOGEUSDT.P', 'XRPUSDT.P',
  'BNBUSDT.P', 'ADAUSDT.P', 'AVAXUSDT.P', 'DOTUSDT.P', 'LINKUSDT.P',
  'MATICUSDT.P', 'NEARUSDT.P', 'APTUSDT.P', 'ARBUSDT.P', 'OPUSDT.P',
  'SUIUSDT.P', 'INJUSDT.P', 'SEIUSDT.P', 'TRXUSDT.P', 'LTCUSDT.P',
];

export default function AddCoinDialog({ onAdded, existingSymbols }: AddCoinDialogProps) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);

  const available = POPULAR_OKX_COINS.filter(c => !existingSymbols.includes(c));

  const addCoin = async (symbol: string) => {
    setLoading(true);
    const sym = symbol.toUpperCase().trim();
    if (!sym.endsWith('.P')) {
      toast({ title: 'Format harus seperti BTCUSDT.P', variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Add to sim coins
    const { error: e1 } = await supabase.from('okx_sim_coins').insert({ symbol: sym });
    if (e1) {
      toast({ title: 'Gagal menambahkan koin', description: e1.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    // Create sim state & auto config for each strategy
    const strategies = ['trend-scalping', 'smart-money', 'multi-indicator', 'gainz-algo-v3', 'luxalgo-iof'];
    for (const strategy of strategies) {
      await supabase.from('okx_sim_state').insert({ symbol: sym, strategy });
      await supabase.from('okx_auto_config').insert({ symbol: sym, strategy });
    }

    toast({ title: `${sym} ditambahkan` });
    setLoading(false);
    setCustom('');
    setOpen(false);
    onAdded();
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all">
        <Plus className="w-3 h-3" /> Tambah Koin
      </button>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-foreground">Tambah Koin OKX Futures</h3>
        <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex gap-1.5">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          placeholder="Contoh: ETHUSDT.P"
          className="flex-1 text-[11px] px-2 py-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground"
        />
        <button onClick={() => addCoin(custom)} disabled={!custom || loading}
          className="px-3 py-1.5 rounded text-[10px] font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          Tambah
        </button>
      </div>

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {available.slice(0, 12).map(c => (
            <button key={c} onClick={() => addCoin(c)} disabled={loading}
              className="px-2 py-1 rounded text-[9px] font-semibold bg-muted text-muted-foreground border border-border hover:border-primary/30 hover:text-foreground transition-all disabled:opacity-50">
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
