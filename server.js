'use strict';
require('dotenv').config();
const crypto = require('crypto');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const QRCode = require('qrcode');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const UMBRELLA_API_URL = process.env.UMBRELLA_API_URL || 'https://api-gateway.umbrellapag.com/api/user/transactions';

// ALTERE O VALOR REAL AQUI. A API trabalha em centavos.
const PRODUCT = Object.freeze({
  title: 'Promoção Especial EspiritualFlix - Espiritualidade - Terapias Holísticas - Profissionalização + Bônus',
  externalRef: 'espiritualflix-promocao-especial',
  amount: 29700,
  currency: 'BRL'
});

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const digits = (v='') => String(v).replace(/\D/g, '');
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'').trim());
function validCPF(cpf) {
  cpf = digits(cpf);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i=0;i<len-1;i++) sum += Number(cpf[i]) * (len-i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(10) === Number(cpf[9]) && calc(11) === Number(cpf[10]);
}
function validCNPJ(cnpj) {
  cnpj = digits(cnpj);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base, weights) => {
    const sum = base.split('').reduce((a,d,i)=>a+Number(d)*weights[i],0);
    const r = sum % 11;
    return r < 2 ? 0 : 11-r;
  };
  const d1 = calc(cnpj.slice(0,12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(cnpj.slice(0,12)+d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.endsWith(`${d1}${d2}`);
}
function validate(body) {
  const name = String(body.name||'').trim().replace(/\s+/g,' ');
  const email = String(body.email||'').trim().toLowerCase();
  const emailConfirm = String(body.emailConfirm||'').trim().toLowerCase();
  const phone = digits(body.phone);
  const document = digits(body.document);
  if (name.length < 3 || !name.includes(' ')) throw new Error('Informe seu nome completo.');
  if (!validEmail(email)) throw new Error('Informe um e-mail válido.');
  if (email !== emailConfirm) throw new Error('Os e-mails informados não coincidem.');
  if (phone.length < 10 || phone.length > 13) throw new Error('Informe um celular válido com DDD.');
  if (document.length === 11 && !validCPF(document)) throw new Error('Informe um CPF válido.');
  if (document.length === 14 && !validCNPJ(document)) throw new Error('Informe um CNPJ válido.');
  if (![11,14].includes(document.length)) throw new Error('Informe um CPF ou CNPJ válido.');
  return { name, email, phone, document, documentType: document.length === 14 ? 'CNPJ' : 'CPF' };
}
function headers() {
  const key = String(process.env.UMBRELLA_API_KEY||'').trim();
  if (!key) throw new Error('A UMBRELLA_API_KEY não foi configurada no Render.');
  return { 'x-api-key': key, 'User-Agent': 'UMBRELLAB2B/1.0', 'Content-Type': 'application/json', Accept: 'application/json' };
}
function extract(body) {
  const tx = body?.data && typeof body.data === 'object' ? body.data : body;
  const pix = tx?.pix && typeof tx.pix === 'object' ? tx.pix : {};
  const vals = [tx?.qrCode, tx?.qrcode, pix.qrCode, pix.qrcode, pix.code, pix.copyPaste, pix.copyAndPaste, pix.emv, pix.payload];
  return {
    tx: tx || {},
    code: vals.find(v => typeof v === 'string' && v.trim() && !v.startsWith('data:image'))?.trim() || '',
    image: vals.find(v => typeof v === 'string' && v.startsWith('data:image')) || '',
    expirationDate: pix.expirationDate || tx?.expirationDate || null
  };
}
app.get('/health', (_req,res)=>res.json({ok:true,gateway:'UmbrellaPag'}));
app.get('/api/config', (_req,res)=>res.json({amount:PRODUCT.amount,title:PRODUCT.title,whatsappEnabled:Boolean(digits(process.env.WHATSAPP_NUMBER))}));
app.post('/api/create-pix', async (req,res) => {
  try {
    const c = validate(req.body||{});
    const checkoutRef = `ESP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const base = String(process.env.PUBLIC_BASE_URL||'').replace(/\/$/,'');
    const payload = {
      amount: PRODUCT.amount,
      currency: PRODUCT.currency,
      paymentMethod: 'PIX',
      installments: 1,
      customer: {
        name: c.name,
        email: c.email,
        document: { number: c.document, type: c.documentType },
        phone: c.phone,
        externalRef: `customer-${c.document}`
      },
      items: [{ title: PRODUCT.title, unitPrice: PRODUCT.amount, quantity: 1, tangible: false, externalRef: PRODUCT.externalRef }],
      pix: { expiresInDays: 1 },
      postbackUrl: base ? `${base}/api/postback` : '',
      metadata: JSON.stringify({ product: PRODUCT.externalRef, checkoutRef }),
      traceable: true,
      ip: String(req.headers['x-forwarded-for']||'').split(',')[0].trim() || req.socket.remoteAddress || '127.0.0.1'
    };
    const response = await fetch(UMBRELLA_API_URL, { method:'POST', headers:headers(), body:JSON.stringify(payload), signal:AbortSignal.timeout(20000) });
    const raw = await response.text();
    let data; try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw || 'Resposta inválida do gateway.' }; }
    if (!response.ok) {
      console.error('UmbrellaPag error:', response.status, data);
      return res.status(response.status >= 400 && response.status < 500 ? 400 : 502).json({ ok:false, message:data?.message || data?.error?.message || 'Não foi possível gerar o Pix.' });
    }
    const p = extract(data);
    if (!p.code && !p.image) {
      console.error('Resposta sem Pix reconhecido:', JSON.stringify(data));
      return res.status(502).json({ok:false,message:'A transação foi criada, mas a API não retornou o código Pix em um campo reconhecido. Consulte os logs do Render.'});
    }
    const qrCodeDataUrl = p.image || await QRCode.toDataURL(p.code,{width:380,margin:1,errorCorrectionLevel:'M'});
    res.json({ok:true,transaction:{id:p.tx.id||null,status:p.tx.status||'PENDING',amount:p.tx.amount||PRODUCT.amount,externalRef:p.tx.externalRef||checkoutRef,expirationDate:p.expirationDate},pix:{code:p.code,qrCodeDataUrl}});
  } catch (err) {
    console.error('create-pix error:', err);
    const timeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    res.status(timeout?504:400).json({ok:false,message:timeout?'O gateway demorou para responder. Tente novamente.':(err.message||'Não foi possível gerar o Pix.')});
  }
});
app.post('/api/postback',(req,res)=>{ console.log('UmbrellaPag postback:',JSON.stringify(req.body||{})); res.sendStatus(204); });
app.listen(PORT,()=>console.log(`Servidor ativo na porta ${PORT}`));
