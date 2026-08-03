const PRODUCT = Object.freeze({
  title: 'Curso Profissionalizante de Refrigeração Comercial',
  amount: 49700,
  externalRef: 'refrigeracao-comercial'
});

const DEFAULT_API_URL = 'https://api-gateway.umbrellapag.com/api/user/transactions';

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(cpf[i]) * (10 - i);
  let check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  if (check !== Number(cpf[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(cpf[i]) * (11 - i);
  check = 11 - (sum % 11);
  if (check >= 10) check = 0;
  return check === Number(cpf[10]);
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function findPixCode(payload) {
  const data = payload?.data || payload || {};
  const pix = data?.pix || {};

  return (
    data.qrCode ||
    data.qrcode ||
    data.pixCode ||
    data.copyPaste ||
    data.copyPasteCode ||
    pix.qrCode ||
    pix.qrcode ||
    pix.pixCode ||
    pix.copyPaste ||
    pix.copyPasteCode ||
    pix.payload ||
    pix.emv ||
    ''
  );
}

function getBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  if (configured) return configured;

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return host ? `${proto}://${host}` : 'https://example.com';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, message: 'Método não permitido.' });
  }

  try {
    const apiKey = String(process.env.UMBRELLA_API_KEY || '').trim();
    const apiUrl = String(process.env.UMBRELLA_API_URL || DEFAULT_API_URL).trim();

    if (!apiKey) {
      return res.status(503).json({
        ok: false,
        message: 'A variável UMBRELLA_API_KEY não foi configurada na Vercel.'
      });
    }

    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const phone = digits(req.body?.phone);
    const documentNumber = digits(req.body?.document);

    if (name.length < 3) {
      return res.status(400).json({ ok: false, message: 'Informe o nome completo.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ ok: false, message: 'Informe um email válido.' });
    }
    if (phone.length < 10 || phone.length > 11) {
      return res.status(400).json({ ok: false, message: 'Informe um celular válido.' });
    }
    if (![11, 14].includes(documentNumber.length)) {
      return res.status(400).json({ ok: false, message: 'Informe um CPF ou CNPJ válido.' });
    }
    if (documentNumber.length === 11 && !isValidCpf(documentNumber)) {
      return res.status(400).json({ ok: false, message: 'Informe um CPF válido.' });
    }

    const transactionRef = `refrigeracao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const address = {
      street: 'Não informado',
      streetNumber: '0',
      complement: 'Não informado',
      zipCode: '00000000',
      neighborhood: 'Não informado',
      city: 'São Paulo',
      state: 'SP',
      country: 'BR'
    };

    const payload = {
      amount: PRODUCT.amount,
      currency: 'BRL',
      paymentMethod: 'PIX',
      installments: 1,
      customer: {
        name,
        email,
        phone,
        externalRef: transactionRef,
        document: {
          type: documentNumber.length === 11 ? 'CPF' : 'CNPJ',
          number: documentNumber
        },
        address
      },
      shipping: {
        fee: 0,
        address
      },
      items: [
        {
          title: PRODUCT.title,
          unitPrice: PRODUCT.amount,
          quantity: 1,
          tangible: false,
          externalRef: PRODUCT.externalRef
        }
      ],
      pix: {
        expiresInDays: 1
      },
      boleto: {
        expiresInDays: 1
      },
      card: {
        number: '',
        holderName: '',
        expirationMonth: 1,
        expirationYear: 2030,
        cvv: ''
      },
      postbackUrl: getBaseUrl(req),
      metadata: JSON.stringify({ product: PRODUCT.externalRef }),
      traceable: true,
      ip: getClientIp(req)
    };

    const gatewayResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'User-Agent': 'UMBRELLAB2B/1.0',
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const raw = await gatewayResponse.text();
    let gatewayData = {};
    try {
      gatewayData = raw ? JSON.parse(raw) : {};
    } catch {
      gatewayData = { raw };
    }

    if (!gatewayResponse.ok) {
      console.error('UmbrellaPag:', gatewayResponse.status, gatewayData);
      return res.status(gatewayResponse.status).json({
        ok: false,
        message:
          gatewayData?.message ||
          gatewayData?.error?.message ||
          'A UmbrellaPag recusou a solicitação.',
        details: process.env.NODE_ENV === 'development' ? gatewayData : undefined
      });
    }

    const pixCode = findPixCode(gatewayData);
    const transaction = gatewayData?.data || gatewayData;

    if (!pixCode) {
      console.error('Resposta Pix sem código copia e cola:', gatewayData);
      return res.status(502).json({
        ok: false,
        message: 'A transação foi criada, mas a UmbrellaPag não retornou o código Pix.',
        transactionId: transaction?.id || null,
        status: transaction?.status || null
      });
    }

    return res.status(200).json({
      ok: true,
      transactionId: transaction?.id || null,
      status: transaction?.status || 'WAITING_PAYMENT',
      amount: PRODUCT.amount,
      qrCode: pixCode,
      pixCode
    });
  } catch (error) {
    console.error('Erro em /api/create-pix:', error);
    return res.status(500).json({
      ok: false,
      message: 'Erro interno ao gerar o Pix.'
    });
  }
};
