
const PRODUCT = Object.freeze({
  title: "Formação em Perícias Judiciais Elétricas",
  amount: 49700,
  externalRef: "formacao-pericias-judiciais-eletricas"
});

const API_URL =
  process.env.UMBRELLA_API_URL ||
  "https://api-gateway.umbrellapag.com/api/user/transactions";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

function getPixCode(payload) {
  return payload?.data?.qrCode ||
    payload?.data?.qrcode ||
    payload?.data?.pix?.qrCode ||
    payload?.data?.pix?.qrcode ||
    payload?.data?.pix?.copyPaste ||
    payload?.data?.pix?.copyPasteCode ||
    payload?.qrCode ||
    payload?.qrcode ||
    "";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ok: false, message: "Método não permitido."});
  }

  const apiKey = String(process.env.UMBRELLA_API_KEY || "").trim();
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      message: "A chave da UmbrellaPag não foi configurada na Vercel."
    });
  }

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = onlyDigits(req.body?.phone);
  const documentNumber = onlyDigits(req.body?.document);

  if (name.length < 3) return res.status(400).json({ok:false,message:"Informe o nome completo."});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ok:false,message:"Informe um email válido."});
  if (phone.length < 10 || phone.length > 11) return res.status(400).json({ok:false,message:"Informe um telefone válido."});
  if (![11,14].includes(documentNumber.length)) return res.status(400).json({ok:false,message:"Informe um CPF ou CNPJ válido."});

  const externalRef = `pericias-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const address = {
    street: "Não informado",
    streetNumber: "0",
    neighborhood: "Não informado",
    city: "São Paulo",
    state: "SP",
    zipCode: "00000000",
    country: "BR",
    complement: "Não informado"
  };

  const payload = {
    amount: PRODUCT.amount,
    currency: "BRL",
    paymentMethod: "PIX",
    installments: 1,
    customer: {
      name,
      email,
      phone,
      externalRef,
      document: {
        type: documentNumber.length === 11 ? "CPF" : "CNPJ",
        number: documentNumber
      },
      address
    },
    items: [{
      title: PRODUCT.title,
      unitPrice: PRODUCT.amount,
      quantity: 1,
      tangible: false,
      externalRef: PRODUCT.externalRef
    }],
    pix: {expiresInDays: 1},
    metadata: JSON.stringify({product: PRODUCT.externalRef}),
    traceable: true,
    ip: String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "127.0.0.1"
  };

  try {
    const gatewayResponse = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "User-Agent": "UMBRELLAB2B/1.0",
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const text = await gatewayResponse.text();
    let gatewayData;
    try {
      gatewayData = text ? JSON.parse(text) : {};
    } catch {
      gatewayData = {raw: text};
    }

    if (!gatewayResponse.ok) {
      console.error("UmbrellaPag:", gatewayResponse.status, gatewayData);
      return res.status(gatewayResponse.status).json({
        ok: false,
        message: gatewayData?.message || gatewayData?.error?.message || "A UmbrellaPag recusou a solicitação."
      });
    }

    const pixCode = getPixCode(gatewayData);

    return res.status(200).json({
      ok: true,
      id: gatewayData?.data?.id || gatewayData?.id || null,
      status: gatewayData?.data?.status || gatewayData?.status || "WAITING_PAYMENT",
      pixCode,
      qrCode: pixCode
    });
  } catch (error) {
    console.error("Erro create-pix:", error);
    return res.status(500).json({ok:false,message:"Erro interno ao gerar o Pix."});
  }
};
