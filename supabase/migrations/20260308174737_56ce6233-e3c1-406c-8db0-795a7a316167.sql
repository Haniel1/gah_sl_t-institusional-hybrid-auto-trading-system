
CREATE TABLE public.simulation_coins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coin_symbol text NOT NULL UNIQUE,
  added_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.simulation_coins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on simulation_coins" ON public.simulation_coins FOR ALL USING (true) WITH CHECK (true);

-- Seed with default watchlist
INSERT INTO public.simulation_coins (coin_symbol) VALUES
  ('BTC'), ('ETH'), ('BNB'), ('SOL'), ('ADA'), ('DOT'), ('AVAX'), ('LINK'), ('MATIC'), ('UNI'),
  ('ATOM'), ('XRP'), ('DOGE'), ('SHIB'), ('ARB'), ('OP'), ('APT'), ('SUI'), ('SEI'), ('INJ'),
  ('NEAR'), ('FTM'), ('ALGO'), ('MANA'), ('SAND'), ('AXS'), ('GALA'), ('IMX'), ('ICP'), ('FIL'),
  ('AAVE'), ('MKR'), ('CRV'), ('LDO'), ('ENS'), ('WBTC'), ('BCH'), ('LTC'), ('ETC'), ('XLM');
