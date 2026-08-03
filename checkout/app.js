
const form = document.getElementById("checkoutForm");
const payButton = document.getElementById("payButton");
const message = document.getElementById("message");
const pixResult = document.getElementById("pixResult");
const pixCodeField = document.getElementById("pixCode");
const qrCodeContainer = document.getElementById("qrCode");
const copyPixButton = document.getElementById("copyPix");
const orderDetails = document.getElementById("orderDetails");
const toggleDetails = document.getElementById("toggleDetails");

const digits = (value) => String(value || "").replace(/\D/g, "");

toggleDetails.addEventListener("click", () => {
  const hidden = orderDetails.hidden;
  orderDetails.hidden = !hidden;
  toggleDetails.textContent = hidden ? "Esconder⌃" : "Mostrar⌄";
});

document.getElementById("document").addEventListener("input", (event) => {
  const value = digits(event.target.value).slice(0, 14);
  event.target.value = value.length <= 11
    ? value.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2")
    : value.replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
});

function extractPixCode(data) {
  return data?.pixCode ||
    data?.qrCode ||
    data?.qrcode ||
    data?.data?.qrCode ||
    data?.data?.qrcode ||
    data?.data?.pix?.qrCode ||
    data?.data?.pix?.qrcode ||
    data?.data?.pix?.copyPaste ||
    data?.data?.pix?.copyPasteCode ||
    "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";

  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const phone = digits(document.getElementById("phone").value);
  const documentNumber = digits(document.getElementById("document").value);

  if (!name || !email || !phone || !documentNumber) {
    message.textContent = "Preencha todos os campos.";
    return;
  }

  payButton.disabled = true;
  payButton.textContent = "Gerando Pix...";

  try {
    const response = await fetch("/api/create-pix", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({name, email, phone, document: documentNumber})
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Não foi possível gerar o Pix.");

    const pixCode = extractPixCode(result);
    if (!pixCode) throw new Error("A cobrança foi criada, mas o código Pix não foi retornado.");

    pixCodeField.value = pixCode;
    qrCodeContainer.innerHTML = "";
    new QRCode(qrCodeContainer, {text: pixCode, width: 190, height: 190});
    pixResult.hidden = false;
    pixResult.scrollIntoView({behavior: "smooth", block: "center"});
  } catch (error) {
    message.textContent = error.message;
  } finally {
    payButton.disabled = false;
    payButton.textContent = "Pagar";
  }
});

copyPixButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pixCodeField.value);
    copyPixButton.textContent = "Código copiado";
    setTimeout(() => copyPixButton.textContent = "Copiar código Pix", 1800);
  } catch {
    pixCodeField.select();
    document.execCommand("copy");
  }
});
