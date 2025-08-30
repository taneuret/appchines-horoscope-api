// Vercel Serverless Function: POST /api/horoscope
// (versão simples, sem precisar de package.json)

module.exports = async (req, res) => {
  // --- CORS básico (libera para todos só para testar) ---
  const origin = req.headers.origin || "*";
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    return res.status(204).end();
  }
  res.setHeader("Access-Control-Allow-Origin", origin);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { sign, sign_label, date } = body;
    if (!sign) return res.status(400).json({ error: 'missing "sign"' });

    const day = date || new Date().toISOString().slice(0,10);

    // Saída estruturada (4 campos fixos)
    const schema = {
      type: "object",
      properties: {
        relacionamentos: { type: "string" },
        sorte: { type: "string" },
        trabalho: { type: "string" },
        astral: { type: "string" }
      },
      required: ["relacionamentos","sorte","trabalho","astral"],
      additionalProperties: false
    };

    const prompt = `
Você é um astrólogo copywriter. Gere a leitura do dia para o signo ${sign_label || sign}, data ${day}.
ENTREGAS (apenas JSON com estas chaves, nessa ordem): relacionamentos, sorte, trabalho, astral.
Diretrizes:
- Tom: místico, claro, motivador, PT-BR (Brasil).
- "sorte": use gatilhos sutis para a pessoa perceber que hoje está com sorte; sem prometer ganhos; linguagem responsável; número do dia 20 se fizer sentido.
- ~80–120 palavras por seção. Sem markdown; só texto puro em cada campo.
`;

    // Chamada ao endpoint /v1/responses da OpenAI
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        input: [
          { role: "system", content: "Retorne SOMENTE JSON válido conforme o schema." },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_schema", json_schema: { name: "horoscope", schema } }
      })
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(500).json({ error: "openai_error", detail: txt });
    }

    const data = await resp.json();
    const text = data.output_text ?? (data.output?.[0]?.content?.[0]?.text ?? "");
    let out;
    try { out = JSON.parse(text); } catch {
      return res.status(500).json({ error: "invalid_json_from_model", raw: text });
    }

    // Cache na borda por 1h (Vercel CDN)
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=60");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: "failed_to_generate", detail: String(e) });
  }
};
