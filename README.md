# Checkout Pix — SKN Science Academy

Projeto Node.js + Express preparado para hospedagem no Render. O checkout mantém a identidade visual do modelo enviado e deixa apenas Pix ativo.

## Estrutura

- `server.js`: backend e integração com a PayShark.
- `public/index.html`: checkout.
- `public/style.css`: layout responsivo.
- `public/app.js`: validação, geração, cópia do Pix e liberação manual.
- `render.yaml`: configuração opcional de Blueprint no Render.

## Configuração local

```bash
npm install
cp .env.example .env
npm start
```

Acesse `http://localhost:3000`.

## Variáveis obrigatórias no Render

Configure em **Environment**:

```env
PAYSHARK_API_URL=https://api.paysharkgateway.com.br/v1/transactions
AUTH_HEADER_NAME=Authorization
AUTH_HEADER_VALUE=Bearer SEU_TOKEN
WHATSAPP_NUMBER=5575999999999
PUBLIC_BASE_URL=https://seu-servico.onrender.com
```

A autenticação acima é apenas um exemplo. Como a documentação enviada ainda não informa o cabeçalho exato, `AUTH_HEADER_NAME` e `AUTH_HEADER_VALUE` foram deixados configuráveis.

Exemplos:

```env
AUTH_HEADER_NAME=x-api-key
AUTH_HEADER_VALUE=SUA_CHAVE
```

ou:

```env
AUTH_HEADER_NAME=Authorization
AUTH_HEADER_VALUE=Basic SEU_TOKEN
```

## Publicação manual no Render

1. Envie os arquivos para um repositório GitHub.
2. No Render, crie um **Web Service**.
3. Selecione o repositório.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Adicione as variáveis de ambiente.
7. Publique.

## Blueprint

Também é possível usar o arquivo `render.yaml` com a opção **New Blueprint Instance**.

## Segurança

- O valor é fixado no backend em `87000` centavos, impedindo alteração pelo navegador.
- A credencial da PayShark fica somente no ambiente do Render.
- O frontend não recebe o token da API.
- A primeira versão não confirma pagamento automaticamente; a liberação é manual.

## Observação sobre a API

O código espera que a PayShark retorne o Pix em um destes campos:

- `pix.qrcode`
- `pix.qrCode`
- `pix.copyPaste`
- `pix.emv`

O primeiro formato é o indicado na documentação enviada. Caso a resposta real tenha outro nome, ajuste a função `extractPixCode` em `server.js`.
