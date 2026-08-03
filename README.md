# Formação em Perícias Judiciais Elétricas

Estrutura simples para Vercel:

- `/lp/` — landing page, apenas `index.html`
- `/checkout/` — checkout completo
- `/api/create-pix` — criação do Pix UmbrellaPag

## Variáveis na Vercel

Configure:

- `UMBRELLA_API_KEY`
- `UMBRELLA_API_URL=https://api-gateway.umbrellapag.com/api/user/transactions`

## URLs

- `https://seu-dominio.vercel.app/lp/`
- `https://seu-dominio.vercel.app/checkout/`

O valor real está fixo no backend como `400000` centavos, equivalente a R$ 4.000,00.
