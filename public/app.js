'use strict';

const form = document.getElementById('checkoutForm');
const submitButton = document.getElementById('submitButton');
const formError = document.getElementById('formError');
const checkoutStep = document.getElementById('checkoutStep');
const pixStep = document.getElementById('pixStep');
const qrCodeImage = document.getElementById('qrCodeImage');
const pixCode = document.getElementById('pixCode');
const copyPixButton = document.getElementById('copyPixButton');
const copyFeedback = document.getElementById('copyFeedback');
const expirationText = document.getElementById('expirationText');
const manualReleaseButton = document.getElementById('manualReleaseButton');
const backButton = document.getElementById('backButton');
const transactionRef = document.getElementById('transactionRef');

let lastTransaction = null;
let whatsappEnabled = false;

const fields = {
  name: document.getElementById('name'),
  email: document.getElementById('email'),
  phone: document.getElementById('phone'),
  document: document.getElementById('document')
};

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function formatPhone(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDocument(value) {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

fields.phone.addEventListener('input', (event) => {
  event.target.value = formatPhone(event.target.value);
});
fields.document.addEventListener('input', (event) => {
  event.target.value = formatDocument(event.target.value);
});

async function loadConfig() {
  try {
    const response = await fetch('/api/config');
    const config = await response.json();
    whatsappEnabled = Boolean(config.whatsappEnabled);
  } catch {
    whatsappEnabled = false;
  }
}
loadConfig();

function setLoading(active) {
  submitButton.disabled = active;
  submitButton.classList.toggle('loading', active);
}

function showError(message) {
  formError.textContent = message || '';
}

function displayPix(data) {
  lastTransaction = data.transaction;
  qrCodeImage.src = data.pix.qrCodeDataUrl;
  pixCode.value = data.pix.code;
  transactionRef.textContent = `Transação: ${data.transaction.id ?? '-'} • Referência: ${data.transaction.externalRef ?? '-'}`;

  if (data.transaction.expirationDate) {
    const date = new Date(data.transaction.expirationDate);
    expirationText.textContent = Number.isNaN(date.getTime())
      ? 'O código Pix expira em até 1 dia.'
      : `Expira em ${date.toLocaleString('pt-BR')}.`;
  } else {
    expirationText.textContent = 'O código Pix expira em até 1 dia.';
  }

  manualReleaseButton.hidden = !whatsappEnabled;
  checkoutStep.hidden = true;
  pixStep.hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('');

  const payload = {
    name: fields.name.value,
    email: fields.email.value,
    phone: onlyDigits(fields.phone.value),
    document: onlyDigits(fields.document.value)
  };

  setLoading(true);
  try {
    const response = await fetch('/api/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.message || 'Não foi possível gerar o Pix.');
    displayPix(data);
  } catch (error) {
    showError(error.message || 'Não foi possível gerar o Pix. Tente novamente.');
  } finally {
    setLoading(false);
  }
});

copyPixButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(pixCode.value);
    copyFeedback.textContent = 'Código Pix copiado.';
  } catch {
    pixCode.focus();
    pixCode.select();
    const copied = document.execCommand('copy');
    copyFeedback.textContent = copied ? 'Código Pix copiado.' : 'Selecione e copie o código manualmente.';
  }
  setTimeout(() => { copyFeedback.textContent = ''; }, 2500);
});

manualReleaseButton.addEventListener('click', async () => {
  if (!lastTransaction) return;
  manualReleaseButton.disabled = true;
  try {
    const response = await fetch('/api/manual-release-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: fields.name.value,
        email: fields.email.value,
        phone: fields.phone.value,
        transactionId: lastTransaction.id,
        externalRef: lastTransaction.externalRef
      })
    });
    const data = await response.json();
    if (!response.ok || !data.url) throw new Error(data.message || 'WhatsApp não configurado.');
    window.open(data.url, '_blank', 'noopener,noreferrer');
  } catch (error) {
    copyFeedback.textContent = error.message;
  } finally {
    manualReleaseButton.disabled = false;
  }
});

backButton.addEventListener('click', () => {
  pixStep.hidden = true;
  checkoutStep.hidden = false;
  lastTransaction = null;
  pixCode.value = '';
  qrCodeImage.removeAttribute('src');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

