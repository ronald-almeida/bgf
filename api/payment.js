const PRODUCT = Object.freeze({
  title: "Combo Premium - Ouse Passar",
  amount: 34700,
  externalRef: "combo-premium-ouse-passar"
});

const UMBRELLA_URL =
  process.env.UMBRELLA_API_URL ||
  "https://api-gateway.umbrellapag.com/api/user/transactions";

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

function getPixCode(payload) {
  return (
    payload?.data?.qrCode ||
    payload?.data?.qrcode ||
    payload?.data?.pix?.qrCode ||
    payload?.data?.pix?.qrcode ||
    payload?.data?.pix?.copyPaste ||
    payload?.data?.pix?.copyPasteCode ||
    payload?.qrCode ||
    payload?.qrcode ||
    ""
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Método não permitido." });
  }

  const apiKey = String(process.env.UMBRELLA_API_KEY || "").trim();

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      message: "A API Key da Umbrella não foi configurada na Vercel."
    });
  }

  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = onlyDigits(req.body?.phone);
  const documentNumber = onlyDigits(req.body?.document);

  if (name.length < 3) {
    return res.status(400).json({ ok: false, message: "Informe o nome completo." });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Informe um email válido." });
  }

  if (phone.length < 10 || phone.length > 11) {
    return res.status(400).json({ ok: false, message: "Informe um celular válido." });
  }

  if (![11, 14].includes(documentNumber.length)) {
    return res.status(400).json({ ok: false, message: "Informe um CPF ou CNPJ válido." });
  }

  const externalRef = `ouse-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const payload = {
    amount: PRODUCT.amount,
    currency: "BRL",
    paymentMethod: "PIX",
    customer: {
      name,
      email,
      phone,
      externalRef,
      document: {
        type: documentNumber.length === 11 ? "CPF" : "CNPJ",
        number: documentNumber
      }
    },
    items: [
      {
        title: PRODUCT.title,
        quantity: 1,
        unitPrice: PRODUCT.amount,
        tangible: false,
        externalRef: PRODUCT.externalRef
      }
    ],
    pix: { expiresInDays: 1 },
    externalRef,
    metadata: JSON.stringify({
      product: PRODUCT.externalRef,
      checkout: "vercel"
    }),
    traceable: true
  };

  try {
    const gatewayResponse = await fetch(UMBRELLA_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "User-Agent": "UMBRELLAB2B/1.0",
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await gatewayResponse.text();
    let gatewayData;

    try {
      gatewayData = raw ? JSON.parse(raw) : {};
    } catch {
      gatewayData = { raw };
    }

    if (!gatewayResponse.ok) {
      console.error(
        "Umbrella create payment error:",
        gatewayResponse.status,
        JSON.stringify(gatewayData)
      );

      return res.status(gatewayResponse.status).json({
        ok: false,
        message:
          gatewayData?.message ||
          gatewayData?.error?.message ||
          "A Umbrella recusou a solicitação.",
        error: gatewayData?.error || null
      });
    }

    const pixCode = getPixCode(gatewayData);

    if (!pixCode) {
      return res.status(502).json({
        ok: false,
        message: "A Umbrella criou a transação, mas não retornou o código Pix."
      });
    }

    return res.status(200).json({
      ok: true,
      id: gatewayData?.data?.id || gatewayData?.id || null,
      status:
        gatewayData?.data?.status ||
        gatewayData?.status ||
        "WAITING_PAYMENT",
      copypaste: pixCode,
      pixCode
    });
  } catch (error) {
    console.error("Umbrella connection error:", error);

    return res.status(500).json({
      ok: false,
      message: "Erro interno ao gerar o Pix."
    });
  }
};
