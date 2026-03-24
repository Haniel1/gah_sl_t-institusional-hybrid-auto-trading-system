import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_NAME = '🤖 GainzHalving';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, user_id } = await req.json();

    // Prepend app name if not already present
    const finalMessage = message.includes('GainzHalving') ? message : `<b>${APP_NAME}</b>\n\n${message}`;

    let token = Deno.env.get('TELEGRAM_BOT_TOKEN')!;
    let chatId = Deno.env.get('TELEGRAM_CHAT_ID')!;

    if (user_id) {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: userData } = await supabase
        .from('trading_users')
        .select('telegram_bot_token, telegram_chat_id')
        .eq('id', user_id)
        .single();
      if (userData?.telegram_bot_token && userData?.telegram_chat_id) {
        token = userData.telegram_bot_token;
        chatId = userData.telegram_chat_id;
      }
    }

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: finalMessage, parse_mode: 'HTML' }),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: errMsg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
