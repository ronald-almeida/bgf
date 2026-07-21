# Checkout Pix — SKN Science Academy + UmbrellaPag

Projeto Node.js + Express para GitHub e Render, com checkout Pix e liberação manual.

## Variáveis no Render

```env
UMBRELLA_API_URL=https://api-gateway.umbrellapag.com/api/user/transactions
UMBRELLA_API_KEY=SUA_X_API_KEY
PUBLIC_BASE_URL=https://seu-servico.onrender.com
WHATSAPP_NUMBER=5575999999999
```

Remova as variáveis antigas da PayShark (`PAYSHARK_API_URL`, `PAYSHARK_SECRET_KEY`, `AUTH_HEADER_NAME`, `AUTH_HEADER_VALUE`).

## GitHub + Render

1. Envie todos os arquivos para o repositório GitHub.
2. No Render, conecte o repositório como Web Service.
3. Build Command: `npm install`
4. Start Command: `npm start`
5. Cadastre as variáveis acima.
6. Execute `Clear build cache & deploy`.

## Valor cobrado

O valor real enviado ao gateway fica no `server.js`:

```js
amount: 87000
```

A API trabalha em centavos. Exemplo: R$ 870,00 = `87000`.

## Fluxo

- O navegador envia somente nome, e-mail, telefone e CPF/CNPJ.
- O backend fixa o preço e cria a transação na UmbrellaPag.
- O QR Code e o Pix copia e cola são mostrados no checkout.
- A liberação do acesso é manual.
