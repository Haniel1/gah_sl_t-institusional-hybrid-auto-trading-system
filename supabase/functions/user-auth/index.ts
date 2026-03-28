import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json();
    const { action } = body;

    // ── LOGIN ──
    if (action === 'login') {
      const username = (body.username || '').trim();
      const password = body.password || '';
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Username dan password harus diisi' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: user } = await supabase
        .from('trading_users')
        .select('id, name, username, is_active, created_at')
        .eq('username', username)
        .single();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Username tidak ditemukan' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!user.is_active) {
        return new Response(JSON.stringify({ error: 'Akun dinonaktifkan' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify password using pgcrypto
      const { data: match } = await supabase.rpc('verify_password', {
        _username: username,
        _password: password,
      });

      if (!match) {
        return new Response(JSON.stringify({ error: 'Password salah' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, user }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── REGISTER (add new user) ──
    if (action === 'register') {
      const { name, username, password, platform, indodax_api_key, indodax_secret, okx_api_key, okx_secret, okx_passphrase, telegram_bot_token, telegram_chat_id } = body;

      if (!name || !username || !password) {
        return new Response(JSON.stringify({ error: 'Nama, username, dan password wajib diisi' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if username exists
      const { data: existing } = await supabase
        .from('trading_users')
        .select('id')
        .eq('username', username)
        .single();

      if (existing) {
        return new Response(JSON.stringify({ error: 'Username sudah digunakan' }), {
          status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Hash password and insert
      const { data: hashedPw } = await supabase.rpc('hash_password', { _password: password });

      const { data: newUser, error } = await supabase
        .from('trading_users')
        .insert({
          name,
          username,
          password_hash: hashedPw,
          platform: platform || 'indodax',
          indodax_api_key: indodax_api_key || '',
          indodax_secret: indodax_secret || '',
          okx_api_key: okx_api_key || '',
          okx_secret: okx_secret || '',
          okx_passphrase: okx_passphrase || '',
          telegram_bot_token: telegram_bot_token || '',
          telegram_chat_id: telegram_chat_id || '',
        })
        .select('id, name, username, is_active, created_at, platform')
        .single();

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, user: newUser }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── LIST USERS ──
    if (action === 'list') {
      const { data: users } = await supabase
        .from('trading_users')
        .select('id, name, username, is_active, created_at, platform')
        .order('created_at');

      return new Response(JSON.stringify({ users }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── CHANGE PASSWORD ──
    if (action === 'change_password') {
      const { user_id, old_password, new_password } = body;
      if (!user_id || !old_password || !new_password) {
        return new Response(JSON.stringify({ error: 'Semua field wajib diisi' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (new_password.length < 4) {
        return new Response(JSON.stringify({ error: 'Password baru minimal 4 karakter' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get username for verification
      const { data: usr } = await supabase
        .from('trading_users')
        .select('username')
        .eq('id', user_id)
        .single();

      if (!usr) {
        return new Response(JSON.stringify({ error: 'User tidak ditemukan' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify old password
      const { data: match } = await supabase.rpc('verify_password', {
        _username: usr.username,
        _password: old_password,
      });

      if (!match) {
        return new Response(JSON.stringify({ error: 'Password lama salah' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Hash and update
      const { data: hashedPw } = await supabase.rpc('hash_password', { _password: new_password });
      const { error } = await supabase
        .from('trading_users')
        .update({ password_hash: hashedPw })
        .eq('id', user_id);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── DELETE USER ──
    if (action === 'delete') {
      const { user_id } = body;
      await supabase.from('trading_users').delete().eq('id', user_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
