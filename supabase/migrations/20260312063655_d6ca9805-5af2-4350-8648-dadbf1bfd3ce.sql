-- Add unique constraint on pair column for auto_trade_config upsert to work correctly
-- First remove any duplicate pairs (keep the one with most recent updated_at)
DELETE FROM public.auto_trade_config a
WHERE a.id NOT IN (
  SELECT DISTINCT ON (pair) id
  FROM public.auto_trade_config
  ORDER BY pair, updated_at DESC NULLS LAST
);

-- Now add the unique constraint
ALTER TABLE public.auto_trade_config
  ADD CONSTRAINT auto_trade_config_pair_unique UNIQUE (pair);