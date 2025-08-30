# appchines-horoscope-api

API serverless (Vercel) que gera **Relacionamentos, Sorte, Trabalho e Astral** via OpenAI e retorna **JSON**.

- Rota: `POST /api/horoscope`
- Body: `{"sign":"aries","sign_label":"Áries","date":"YYYY-MM-DD"}` (date opcional)

## Variáveis de ambiente (Vercel)
- `OPENAI_API_KEY` = sua chave da OpenAI (NUNCA coloque no front-end).
