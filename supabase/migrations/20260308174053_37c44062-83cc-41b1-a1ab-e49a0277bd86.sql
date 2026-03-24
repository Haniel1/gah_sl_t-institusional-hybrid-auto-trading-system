
-- Add strategy column to simulation tables
ALTER TABLE simulation_state ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'dual_signal';
ALTER TABLE simulation_trades ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'dual_signal';
ALTER TABLE simulation_snapshots ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'dual_signal';

-- Clear existing data for fresh start
DELETE FROM simulation_trades;
DELETE FROM simulation_snapshots;
DELETE FROM simulation_state;
