
-- Trade history table
CREATE TABLE public.trade_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
  price NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  strategy TEXT NOT NULL,
  profit_loss NUMERIC DEFAULT 0,
  balance_after NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Auto-trade settings per coin
CREATE TABLE public.auto_trade_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pair TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  strategy TEXT NOT NULL DEFAULT 'gainzalgo',
  initial_balance NUMERIC NOT NULL DEFAULT 100000,
  current_balance NUMERIC NOT NULL DEFAULT 100000,
  notify_telegram BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- App settings (API keys stored as secrets, this is for UI preferences)
CREATE TABLE public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  telegram_notify_mode TEXT NOT NULL DEFAULT 'selected' CHECK (telegram_notify_mode IN ('single', 'selected', 'all')),
  selected_notify_pairs TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Disable RLS for simplicity (single-user app, no auth)
ALTER TABLE public.trade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_trade_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Allow all access (single-user trading terminal)
CREATE POLICY "Allow all on trade_history" ON public.trade_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on auto_trade_config" ON public.auto_trade_config FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on app_settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert default settings
INSERT INTO public.app_settings (telegram_notify_mode) VALUES ('all');

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_auto_trade_config_updated_at
  BEFORE UPDATE ON public.auto_trade_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_app_settings_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
