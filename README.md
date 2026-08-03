# Landing + Checkout UmbrellaPag na Vercel

## Rotas

- `/` — landing page (`index.html` da raiz)
- `/checkout` — checkout
- `/api/create-pix` — criação do Pix

Não há webhook nem consulta automática de pagamento.

## Variáveis na Vercel

Em **Settings → Environment Variables**, adicione:

- `UMBRELLA_API_KEY`
- `UMBRELLA_API_URL=https://api-gateway.umbrellapag.com/api/user/transactions`
- `PUBLIC_BASE_URL=https://seu-projeto.vercel.app`

Depois faça um novo deploy.

## Valor

O valor real está fixo em `api/create-pix.js`:

```js
amount: 49700
```

`49700` equivale a R$ 497,00.
