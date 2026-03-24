import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { coin, price, change24h, volume, marketData } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    // Build rich context for the AI
    const fearGreedInfo = marketData?.fearGreed
      ? `Fear & Greed Index: ${marketData.fearGreed} (${
          marketData.fearGreed <= 25 ? 'Extreme Fear' : marketData.fearGreed <= 45 ? 'Fear' : marketData.fearGreed <= 55 ? 'Neutral' : marketData.fearGreed <= 75 ? 'Greed' : 'Extreme Greed'
        })`
      : '';

    const globalInfo = marketData?.global
      ? `Global Market Cap: $${(marketData.global.totalMcap / 1e12).toFixed(2)}T, ` +
        `24h Change: ${marketData.global.mcapChange?.toFixed(2)}%, ` +
        `BTC Dominance: ${marketData.global.btcDominance?.toFixed(1)}%, ` +
        `Total Volume: $${(marketData.global.totalVol / 1e9).toFixed(1)}B`
      : '';

    const trendingInfo = marketData?.trending?.length
      ? `Trending coins: ${marketData.trending.slice(0, 5).map((t: any) => t.symbol).join(', ')}`
      : '';

    const systemPrompt = `Kamu adalah AI advisor trading kripto profesional yang menganalisis data real-time dari seluruh dunia.

Kamu harus memberikan rekomendasi trading yang spesifik, actionable, dan berdasarkan data untuk koin yang diminta.

Format respons HARUS dalam Bahasa Indonesia dan mengikuti struktur berikut:
1. **Sinyal**: BUY / SELL / HOLD (pilih satu)
2. **Confidence**: persentase keyakinan (0-100%)
3. **Analisis Singkat**: 2-3 kalimat analisis teknikal & fundamental
4. **Faktor Pendukung**: 3-5 bullet points data yang mendukung keputusan
5. **Risk Level**: LOW / MEDIUM / HIGH
6. **Target Harga**: target take-profit dan stop-loss dalam IDR
7. **Timeframe**: rekomendasi waktu hold (jam/hari/minggu)

Pertimbangkan:
- Sentimen pasar global (Fear & Greed Index)
- Dominasi BTC dan korelasi antar koin
- Volume dan likuiditas
- Tren makroekonomi (inflasi, suku bunga, regulasi)
- Pola teknikal (support/resistance, moving averages)
- Momentum dan volatilitas 24h`;

    const userPrompt = `Analisis koin: ${coin}
Harga saat ini: Rp ${Number(price).toLocaleString('id-ID')}
Perubahan 24h: ${change24h?.toFixed(2)}%
Volume 24h (IDR): Rp ${Number(volume).toLocaleString('id-ID')}

Data Pasar Global:
${fearGreedInfo}
${globalInfo}
${trendingInfo}

Berikan rekomendasi trading terbaik untuk ${coin} berdasarkan semua data di atas.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit tercapai, coba lagi nanti." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Kredit AI habis, silakan top up." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "Tidak ada rekomendasi.";

    // Also extract structured signal via tool calling
    const structuredResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "Extract the trading signal from the analysis. Respond only via the tool call." },
          { role: "user", content },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_signal",
            description: "Extract structured trading signal from analysis text",
            parameters: {
              type: "object",
              properties: {
                signal: { type: "string", enum: ["BUY", "SELL", "HOLD"] },
                confidence: { type: "number", description: "0-100" },
                risk: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
                targetPrice: { type: "number", description: "Take profit price in IDR" },
                stopLoss: { type: "number", description: "Stop loss price in IDR" },
                timeframe: { type: "string", description: "Recommended hold time" },
                summary: { type: "string", description: "One-line summary in Indonesian" },
              },
              required: ["signal", "confidence", "risk", "summary"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_signal" } },
      }),
    });

    let structured = null;
    if (structuredResponse.ok) {
      const sData = await structuredResponse.json();
      const toolCall = sData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          structured = JSON.parse(toolCall.function.arguments);
        } catch { /* ignore parse errors */ }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      analysis: content,
      structured,
      coin,
      timestamp: new Date().toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("AI advisor error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
