# Checkout EspiritualFlix + UmbrellaPag

Valor real fixado no backend: R$ 297,00 (`29700` centavos).

## GitHub + Render
1. Envie todos os arquivos deste projeto para um repositório no GitHub.
2. No Render, crie um Web Service conectado ao repositório.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Crie as variáveis:
   - `UMBRELLA_API_KEY`: sua chave, sem Bearer ou Basic.
   - `UMBRELLA_API_URL`: `https://api-gateway.umbrellapag.com/api/user/transactions`
   - `PUBLIC_BASE_URL`: URL pública do serviço no Render.

## Alterar preço
No `server.js`, altere `PRODUCT.amount`. O valor é em centavos. Altere também os textos visuais no `public/index.html`.
