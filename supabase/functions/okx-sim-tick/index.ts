import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple strategy simulation for background processing
function generatePrice(lastPrice: number): number {
  const change = (Math.random() - 0.498) * lastPrice * 0.004;
  return lastPrice + change;
}

function shouldEnterLong(prices: number[]): { enter: boolean; sl: number; tp: number } {
  if (prices.length < 20) return { enter: false, sl: 0, tp: 0 };
  const last = prices[prices.length - 1];
  const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const momentum = (last - prices[prices.length - 5]) / prices[prices.length - 5];
  if (sma10 > sma20 && momentum > 0.001 && last > sma10) {
    return { enter: true, sl: last * 0.985, tp: last * 1.025 };
  }
  return { enter: false, sl: 0, tp: 0 };
}

function shouldEnterShort(prices: number[]): { enter: boolean; sl: number; tp: number } {
  if (prices.length < 20) return { enter: false, sl: 0, tp: 0 };
  const last = prices[prices.length - 1];
  const sma10 = prices.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const sma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const momentum = (last - prices[prices.length - 5]) / prices[prices.length - 5];
  if (sma10 < sma20 && momentum < -0.001 && last < sma10) {
    return { enter: true, sl: last * 1.015, tp: last * 0.975 };
  }
  return { enter: false, sl: 0, tp: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all running simulations
    const { data: states } = await supabase
      .from("okx_sim_state")
      .select("*")
      .eq("is_running", true);

    if (!states || states.length === 0) {
      return new Response(JSON.stringify({ message: "No running simulations" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];

    for (const state of states) {
      // Generate a simulated price based on last known price or default
      const lastPrice = state.entry_price || 65000;
      const prices: number[] = [];
      let p = lastPrice;
      for (let i = 0; i < 30; i++) {
        p = generatePrice(p);
        prices.push(p);
      }
      const currentPrice = prices[prices.length - 1];

      let updated = false;

      // Check existing position
      if (state.position_side) {
        const pnlPct = state.position_side === 'long'
          ? ((currentPrice - state.entry_price) / state.entry_price) * 100 * state.leverage
          : ((state.entry_price - currentPrice) / state.entry_price) * 100 * state.leverage;
        const pnl = (pnlPct / 100) * state.position_amount;

        const hitSL = state.position_side === 'long' 
          ? currentPrice <= state.stop_loss 
          : currentPrice >= state.stop_loss;
        const hitTP = state.position_side === 'long' 
          ? currentPrice >= state.take_profit 
          : currentPrice <= state.take_profit;

        if (hitSL || hitTP) {
          const reason = hitSL ? 'Stop Loss (background)' : 'Take Profit (background)';

          // Log trade
          await supabase.from("okx_sim_trades").insert({
            symbol: state.symbol,
            side: state.position_side,
            entry_price: state.entry_price,
            exit_price: currentPrice,
            amount: state.position_amount,
            leverage: state.leverage,
            pnl,
            pnl_pct: pnlPct,
            strategy: state.strategy,
            reason,
            entry_time: state.entry_time,
            exit_time: new Date().toISOString(),
          });

          // Update state
          await supabase.from("okx_sim_state").update({
            balance: Number(state.balance) + Number(state.position_amount) + pnl,
            position_side: null,
            entry_price: null,
            position_amount: 0,
            stop_loss: null,
            take_profit: null,
            entry_time: null,
            total_pnl: Number(state.total_pnl) + pnl,
            win_count: state.win_count + (pnl > 0 ? 1 : 0),
            loss_count: state.loss_count + (pnl < 0 ? 1 : 0),
            last_tick_at: new Date().toISOString(),
          }).eq("id", state.id);

          results.push({ symbol: state.symbol, action: 'closed', reason, pnl });
          updated = true;
        }
      }

      // Look for new entry if no position
      if (!updated && !state.position_side) {
        const longSignal = shouldEnterLong(prices);
        const shortSignal = shouldEnterShort(prices);

        if (longSignal.enter || shortSignal.enter) {
          const side = longSignal.enter ? 'long' : 'short';
          const { sl, tp } = longSignal.enter ? longSignal : shortSignal;
          const positionSize = Number(state.balance) * 0.3;

          if (positionSize >= 10) {
            await supabase.from("okx_sim_state").update({
              balance: Number(state.balance) - positionSize,
              position_side: side,
              entry_price: currentPrice,
              position_amount: positionSize,
              stop_loss: sl,
              take_profit: tp,
              entry_time: new Date().toISOString(),
              last_tick_at: new Date().toISOString(),
            }).eq("id", state.id);

            results.push({ symbol: state.symbol, action: 'opened', side, price: currentPrice });
          }
        }
      }

      // Just update last tick
      if (!updated) {
        await supabase.from("okx_sim_state").update({
          last_tick_at: new Date().toISOString(),
        }).eq("id", state.id);
      }
    }

    return new Response(JSON.stringify({ processed: states.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
