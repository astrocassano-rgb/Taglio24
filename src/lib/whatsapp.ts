/**
 * Modulo per l'invio di messaggi WhatsApp
 * Configura queste variabili nel file .env.local:
 * 
 * WHATSAPP_API_URL=https://api.ultramsg.com/instanceXXX/messages/chat
 * WHATSAPP_API_TOKEN=tuo_token
 * WHATSAPP_PROVIDER=ultramsg // oppure "meta", "twilio"
 */

type SendWhatsAppParams = {
  to: string; // Formato E.164 o con country code (es. +393331234567)
  message: string;
};

export async function sendWhatsAppMessage({ to, message }: SendWhatsAppParams) {
  const url = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;
  const provider = process.env.WHATSAPP_PROVIDER || "ultramsg";

  if (!url || !token) {
    console.warn("⚠️ WhatsApp non configurato. Variabili d'ambiente mancanti. Simulazione invio...");
    console.log(`[WHATSAPP SIMULATED] A: ${to}\nMessaggio:\n${message}`);
    return { success: true, simulated: true };
  }

  // Formatta il numero (es. rimuove il + per Ultramsg o per Meta)
  const cleanPhone = to.replace(/[^0-9]/g, "");

  try {
    if (provider === "ultramsg") {
      const params = new URLSearchParams();
      params.append("token", token);
      params.append("to", cleanPhone);
      params.append("body", message);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        throw new Error(`Errore API WhatsApp: ${response.statusText}`);
      }

      return { success: true, simulated: false };
    }
    
    // Altri provider (es. Meta Cloud API)
    // if (provider === "meta") { ... }

    throw new Error("Provider WhatsApp non supportato.");
  } catch (error) {
    console.error("Errore invio WhatsApp:", error);
    return { success: false, error: (error as Error).message };
  }
}
