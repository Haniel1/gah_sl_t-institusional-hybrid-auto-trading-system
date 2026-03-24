
ALTER TABLE public.auto_trade_config 
ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'none',
ADD COLUMN IF NOT EXISTS gainz_buy_signal boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS fabio_buy_signal boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS last_check_at timestamp with time zone DEFAULT now();
