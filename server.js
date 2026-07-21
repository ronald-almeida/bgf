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
const PAYSHARK_API_URL = process.env.PAYSHARK_API_URL || 'https://api.paysharkgateway.com.br/v1/transactions';
const PRODUCT = Object.freeze({
  title: 'SKN Science Academy | Peelings e Cosmecêuticos',
  externalRef: 'skn-science-academy-peelings-cosmeceuticos',
  amount: 420000,
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
  const documentType = documentNumber.length === 14 ? 'cnpj' : 'cpf';

  if (name.length < 3 || !name.includes(' ')) throw new Error('Informe o nome completo.');
  if (!isValidEmail(email)) throw new Error('Informe um e-mail válido.');
  if (phone.length < 10 || phone.length > 13) throw new Error('Informe um telefone válido com DDD.');
  if (documentType === 'cpf' && !isValidCPF(documentNumber)) throw new Error('Informe um CPF válido.');
  if (documentType === 'cnpj' && !isValidCNPJ(documentNumber)) throw new Error('Informe um CNPJ válido.');

  return { name, email, phone, documentNumber, documentType };
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const authHeaderName = String(process.env.AUTH_HEADER_NAME || '').trim();
  const authHeaderValue = String(process.env.AUTH_HEADER_VALUE || '').trim();

  if (authHeaderName && authHeaderValue) headers[authHeaderName] = authHeaderValue;
  return headers;
}

function extractPixCode(apiResponse) {
  return apiResponse?.pix?.qrcode || apiResponse?.pix?.qrCode || apiResponse?.pix?.copyPaste || apiResponse?.pix?.emv || null;
}

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
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
      paymentMethod: 'pix',
      pix: { expiresInDays: 1 },
      items: [{
        title: PRODUCT.title,
        quantity: 1,
        tangible: false,
        unitPrice: PRODUCT.amount,
        externalRef: PRODUCT.externalRef
      }],
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        document: {
          number: customer.documentNumber,
          type: customer.documentType
        }
      },
      externalRef,
      metadata: JSON.stringify({
        product: PRODUCT.externalRef,
        source: 'checkout-render',
        manualRelease: true
      })
    };

    if (publicBaseUrl) payload.returnUrl = publicBaseUrl;

    const headers = buildHeaders();
    if (!process.env.AUTH_HEADER_NAME || !process.env.AUTH_HEADER_VALUE) {
      return res.status(503).json({
        ok: false,
        message: 'A autenticação da PayShark ainda não foi configurada no Render.'
      });
    }

    const response = await fetch(PAYSHARK_API_URL, {
      method: 'POST',
      headers,
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
      console.error('PayShark error:', response.status, data);
      return res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({
        ok: false,
        message: data?.message || 'Não foi possível gerar o Pix.',
        gatewayCode: data?.code || response.status
      });
    }

    const pixCode = extractPixCode(data);
    if (!pixCode) {
      console.error('Resposta sem código Pix:', data);
      return res.status(502).json({
        ok: false,
        message: 'A cobrança foi criada, mas a API não retornou o código Pix esperado.'
      });
    }

    const qrCodeDataUrl = await QRCode.toDataURL(pixCode, {
      width: 420,
      margin: 1,
      errorCorrectionLevel: 'M'
    });

    return res.status(200).json({
      ok: true,
      transaction: {
        id: data.id,
        externalRef: data.externalRef || externalRef,
        status: data.status || 'pending',
        amount: data.amount || PRODUCT.amount,
        expirationDate: data?.pix?.expirationDate || null
      },
      pix: {
        code: pixCode,
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

app.post('/api/manual-release-link', (req, res) => {
  const whatsapp = onlyDigits(process.env.WHATSAPP_NUMBER);
  if (!whatsapp) return res.status(404).json({ ok: false, message: 'WhatsApp não configurado.' });

  const { name, email, phone, transactionId, externalRef } = req.body || {};
  const message = [
    'Olá! Já realizei o pagamento via Pix e gostaria de solicitar a liberação manual.',
    '',
    `Nome: ${String(name || '-').trim()}`,
    `E-mail: ${String(email || '-').trim()}`,
    `Telefone: ${onlyDigits(phone) || '-'}`,
    `Transação: ${String(transactionId || '-').trim()}`,
    `Referência: ${String(externalRef || '-').trim()}`
  ].join('\n');

  res.json({ ok: true, url: `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Checkout iniciado na porta ${PORT}`);
});
