'use strict';

require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UMBRELLA_API_URL = process.env.UMBRELLA_API_URL || 'https://api-gateway.umbrellapag.com/api/user/transactions';

const PRODUCT = Object.freeze({
  title: 'SKN Science Academy | Peelings e Cosmecêuticos',
  externalRef: 'skn-science-academy-peelings-cosmeceuticos',
  amount: 49700,
  currency: 'BRL'
});

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isValidCPF(cpf) {
  cpf = onlyDigits(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (factor) => {
    let total = 0;
    for (let i = 0; i < factor - 1; i += 1) total += Number(cpf[i]) * (factor - i);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}

function isValidCNPJ(cnpj) {
  cnpj = onlyDigits(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  const calculate = (base, weights) => {
    const sum = base.split('').reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const first = calculate(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculate(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.endsWith(`${first}${second}`);
}

function validateCustomer(body) {
  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  const email = String(body.email || '').trim().toLowerCase();
  const phone = onlyDigits(body.phone);
  const documentNumber = onlyDigits(body.document);
  const documentType = documentNumber.length === 14 ? 'CNPJ' : 'CPF';

  if (name.length < 3 || !name.includes(' ')) throw new Error('Informe o nome completo.');
  if (!isValidEmail(email)) throw new Error('Informe um e-mail válido.');
  if (phone.length < 10 || phone.length > 13) throw new Error('Informe um telefone válido com DDD.');
  if (documentType === 'CPF' && !isValidCPF(documentNumber)) throw new Error('Informe um CPF válido.');
  if (documentType === 'CNPJ' && !isValidCNPJ(documentNumber)) throw new Error('Informe um CNPJ válido.');

  return { name, email, phone, documentNumber, documentType };
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket.remoteAddress || '127.0.0.1';
}

function buildHeaders() {
  const apiKey = String(process.env.UMBRELLA_API_KEY || '').trim();
  if (!apiKey) throw new Error('A chave da UmbrellaPag não foi configurada no Render.');

  return {
    'x-api-key': apiKey,
    'User-Agent': 'UMBRELLAB2B/1.0',
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function normalizeGatewayResponse(responseBody) {
  return responseBody?.data && typeof responseBody.data === 'object'
    ? responseBody.data
    : responseBody;
}

function extractPixData(responseBody) {
  const transaction = normalizeGatewayResponse(responseBody) || {};
  const pix = transaction.pix && typeof transaction.pix === 'object' ? transaction.pix : {};

  const candidates = [
    transaction.qrCode,
    transaction.qrcode,
    pix.qrCode,
    pix.qrcode,
    pix.code,
    pix.copyPaste,
    pix.copyAndPaste,
    pix.emv,
    pix.payload
  ];

  const pixCode = candidates.find((value) => typeof value === 'string' && value.trim() && !value.startsWith('data:image'))?.trim() || null;
  const qrCodeImage = candidates.find((value) => typeof value === 'string' && value.startsWith('data:image')) || null;

  return {
    transaction,
    pixCode,
    qrCodeImage,
    expirationDate: pix.expirationDate || transaction.expirationDate || null
  };
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, gateway: 'UmbrellaPag' });
});

app.get('/api/config', (_req, res) => {
  res.json({
    whatsappEnabled: Boolean(onlyDigits(process.env.WHATSAPP_NUMBER)),
    amount: PRODUCT.amount,
    productTitle: PRODUCT.title
  });
});

app.post('/api/create-pix', async (req, res) => {
  try {
    const customer = validateCustomer(req.body || {});
    const externalRef = `SKN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');

    const payload = {
      amount: PRODUCT.amount,
      currency: PRODUCT.currency,
      paymentMethod: 'PIX',
      installments: 1,
      customer: {
        name: customer.name,
        email: customer.email,
        document: {
          number: customer.documentNumber,
          type: customer.documentType
        },
        phone: customer.phone,
        externalRef: `customer-${customer.documentNumber}`
      },
      items: [{
        title: PRODUCT.title,
        unitPrice: PRODUCT.amount,
        quantity: 1,
        tangible: false,
        externalRef: PRODUCT.externalRef
      }],
      pix: { expiresInDays: 1 },
      postbackUrl: publicBaseUrl ? `${publicBaseUrl}/api/postback` : '',
      metadata: JSON.stringify({ product: PRODUCT.externalRef, checkoutRef: externalRef }),
      traceable: true,
      ip: getClientIp(req)
    };

    const response = await fetch(UMBRELLA_API_URL, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000)
    });

    const rawText = await response.text();
    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { message: rawText || 'Resposta inválida do gateway.' };
    }

    if (!response.ok) {
      console.error('UmbrellaPag error:', response.status, data);
      return res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({
        ok: false,
        message: data?.message || data?.error?.message || 'Não foi possível gerar o Pix.',
        gatewayCode: data?.status || response.status
      });
    }

    const extracted = extractPixData(data);
    if (!extracted.pixCode && !extracted.qrCodeImage) {
      console.error('Resposta UmbrellaPag sem código Pix reconhecido:', data);
      return res.status(502).json({
        ok: false,
        message: 'A transação foi criada, mas o gateway não retornou o código Pix em um campo reconhecido. Consulte os logs do Render.'
      });
    }

    const qrCodeDataUrl = extracted.qrCodeImage || await QRCode.toDataURL(extracted.pixCode, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: 'M'
    });

    return res.status(200).json({
      ok: true,
      transaction: {
        id: extracted.transaction.id || null,
        externalRef: extracted.transaction.externalRef || externalRef,
        status: extracted.transaction.status || 'WAITING_PAYMENT',
        amount: extracted.transaction.amount || PRODUCT.amount,
        expirationDate: extracted.expirationDate
      },
      pix: {
        code: extracted.pixCode || '',
        qrCodeDataUrl
      }
    });
  } catch (error) {
    const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    console.error('create-pix error:', error);
    return res.status(isTimeout ? 504 : 400).json({
      ok: false,
      message: isTimeout ? 'O gateway demorou para responder. Tente novamente.' : (error.message || 'Não foi possível gerar o Pix.')
    });
  }
});

// Recebe notificações do gateway, mas a liberação permanece manual.
app.post('/api/postback', (req, res) => {
  console.log('UmbrellaPag postback:', JSON.stringify(req.body || {}));
  res.sendStatus(204);
});

app.post('/api/manual-release-link', (req, res) => {
  const whatsapp = onlyDigits(process.env.WHATSAPP_NUMBER);
  if (!whatsapp) return res.status(404).json({ ok: false, message: 'WhatsApp não configurado.' });

  const { name, email, phone, transactionId, externalRef } = req.body || {};
  const message = [
    'Olá! Já realizei o pagamento via Pix e gostaria de solicitar a liberação manual.',
    '',
    `Nome: ${String(name || '').trim()}`,
    `E-mail: ${String(email || '').trim()}`,
    `Telefone: ${String(phone || '').trim()}`,
    `Transação: ${String(transactionId || '-')}`,
    `Referência: ${String(externalRef || '-')}`
  ].join('\n');

  return res.json({
    ok: true,
    url: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Servidor iniciado na porta ${PORT}. Gateway: UmbrellaPag.`);
});
