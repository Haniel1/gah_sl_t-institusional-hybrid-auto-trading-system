
-- OKX Simulation Coins
CREATE TABLE public.okx_sim_coins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL UNIQUE,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.okx_sim_coins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on okx_sim_coins" ON public.okx_sim_coins FOR ALL USING (true) WITH CHECK (true);

-- Insert default coin
INSERT INTO public.okx_sim_coins (symbol) VALUES ('BTCUSDT.P');

-- OKX Simulation State
CREATE TABLE public.okx_sim_state (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  balance NUMERIC NOT NULL DEFAULT 1000,
  initial_balance NUMERIC NOT NULL DEFAULT 1000,
  position_side TEXT DEFAULT NULL, -- 'long' | 'short' | null
  entry_price NUMERIC DEFAULT NULL,
  position_amount NUMERIC DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 20,
  stop_loss NUMERIC DEFAULT NULL,
  take_profit NUMERIC DEFAULT NULL,
  entry_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  strategy TEXT NOT NULL DEFAULT 'trend-scalping',
  is_running BOOLEAN NOT NULL DEFAULT false,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,
  last_tick_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol)
);
ALTER TABLE public.okx_sim_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on okx_sim_state" ON public.okx_sim_state FOR ALL USING (true) WITH CHECK (true);

-- OKX Simulation Trades
CREATE TABLE public.okx_sim_trades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'long' | 'short'
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 20,
  pnl NUMERIC NOT NULL DEFAULT 0,
  pnl_pct NUMERIC NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL DEFAULT 'trend-scalping',
  reason TEXT DEFAULT NULL,
  entry_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  exit_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.okx_sim_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on okx_sim_trades" ON public.okx_sim_trades FOR ALL USING (true) WITH CHECK (true);

-- OKX Auto Trade Config
CREATE TABLE public.okx_auto_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  strategy TEXT NOT NULL DEFAULT 'trend-scalping',
  leverage INTEGER NOT NULL DEFAULT 20,
  tp_pct NUMERIC NOT NULL DEFAULT 5,
  sl_pct NUMERIC NOT NULL DEFAULT 3,
  balance NUMERIC NOT NULL DEFAULT 1000,
  initial_balance NUMERIC NOT NULL DEFAULT 1000,
  position_side TEXT DEFAULT NULL,
  entry_price NUMERIC DEFAULT NULL,
  position_amount NUMERIC DEFAULT 0,
  stop_loss NUMERIC DEFAULT NULL,
  take_profit NUMERIC DEFAULT NULL,
  entry_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  total_pnl NUMERIC NOT NULL DEFAULT 0,
  win_count INTEGER NOT NULL DEFAULT 0,
  loss_count INTEGER NOT NULL DEFAULT 0,
  last_check_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'idle',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(symbol, strategy)
);
ALTER TABLE public.okx_auto_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on okx_auto_config" ON public.okx_auto_config FOR ALL USING (true) WITH CHECK (true);

-- OKX Auto Trade Log
CREATE TABLE public.okx_auto_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 20,
  pnl NUMERIC NOT NULL DEFAULT 0,
  pnl_pct NUMERIC NOT NULL DEFAULT 0,
  strategy TEXT NOT NULL DEFAULT 'trend-scalping',
  reason TEXT DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.okx_auto_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on okx_auto_log" ON public.okx_auto_log FOR ALL USING (true) WITH CHECK (true);
