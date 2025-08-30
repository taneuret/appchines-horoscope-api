// /api/horoscope — usando Chat Completions + JSON Schema (compatível com Vercel)
module.exports = async (req, res) => {
  // CORS simples
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

  // Lê corpo (aceita JSON ou key=value)
  async function readBody(rq){
    const chunks=[]; for await (const ch of rq) chunks.push(Buffer.isBuffer(ch)?ch:Buffer.from(ch));
    const raw=Buffer.concat(chunks).toString("utf-8").trim();
    const ct=(rq.headers["content-type"]||"").toLowerCase();

    if(ct.includes("application/json")){
      try { return JSON.parse(raw); } catch { 
        return { __invalid_json: true, __raw: raw };
      }
    }
    if(ct.includes("application/x-www-form-urlencoded") || /^[^=\s]+\=/.test(raw)){
      const obj={}; raw.replace(/\r/g,"").replace(/&/g,"\n").split("\n").forEach(line=>{
        const [k,...v]=line.split("="); if(!k) return;
        obj[decodeURIComponent(k.trim())]=decodeURIComponent(v.join("=").trim());
      }); return obj;
    }
    return raw?{raw}:{};
  }

  try{
    const body = await readBody(req);
    if (body.__invalid_json) {
      return res.status(400).json({
        error:"invalid_json",
        hint:'Use Content-Type: application/json e um corpo como {"sign":"aries","sign_label":"Áries"}'
      });
    }

    const { sign, sign_label, date } = body || {};
    if (!sign) {
      return res.status(400).json({
        error:'missing "sign"',
        hint:'Envie {"sign":"aries"} em JSON'
      });
    }

    const day = date || new Date().toISOString().slice(0,10);

    // JSON Schema da resposta
    const schema = {
      type: "object",
      properties: {
        relacionamentos: { type: "string" },
        sorte:           { type: "string" },
        trabalho:        { type: "string" },
        astral:          { type: "string" }
      },
      required: ["relacionamentos","sorte","trabalho","astral"],
      additionalProperties: false
    };

    const prompt = `
Você é um astrólogo copywriter. Gere a leitura do dia para o signo ${sign_label || sign}, data ${day}.
ENTREGAS (apenas JSON com estas chaves, nessa ordem): relacionamentos, sorte, trabalho, astral.
Diretrizes:
- Tom: místico, claro, motivador, PT-BR.
- "sorte": gatilhos sutis para a pessoa perceber que hoje está com sorte; sem prometer ganhos; linguagem responsável; use o número 20 se fizer sentido.
- ~80–120 palavras por seção. Sem markdown; apenas texto puro em cada campo.
`;

    // >>> TROCA AQUI: Chat Completions (aceita messages + json_schema)
    const oai = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type":"application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY || ""}`
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: "Retorne SOMENTE JSON válido conforme o schema." },
          { role: "user", content: prompt }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "horoscope",
            schema: schema,
            strict: true
          }
        },
        // opcional: temperature: 0.7
      })
    });

    if (!oai.ok) {
      const t = await oai.text();
      return res.status(502).json({ error: "openai_error", detail: t });
    }

    const data = await oai.json();
    const content = data?.choices?.[0]?.message?.content;

    let out;
    try {
      out = typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return res.status(500).json({ error: "invalid_json_from_model", raw: content });
    }

    res.setHeader("Cache-Control","s-maxage=3600, stale-while-revalidate=60");
    return res.status(200).json(out);
  }catch(e){
    return res.status(500).json({ error:"failed_to_generate", detail: String(e) });
  }
};
