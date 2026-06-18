"use server";

import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { format } from "date-fns";
import { it } from "date-fns/locale";

import { createClient } from "@supabase/supabase-js";

export async function sendBookingConfirmationWhatsApp(
  userId: string, 
  details: {
    stationName: string;
    dogName: string;
    startTime: string;
    serviceLabel: string;
  }
) {
  if (!userId) return;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Uso chiave server
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: profile } = await supabase.from("profiles").select("phone").eq("id", userId).maybeSingle();
  if (!profile || !profile.phone) return;

  const dateStr = format(new Date(details.startTime), "EEEE d MMMM 'alle' HH:mm", { locale: it });

  const message = `🐾 *DogWash24 - Prenotazione Confermata!*\n\nCiao! Ti confermiamo l'appuntamento per *${details.dogName}*.\n\n🗓️ Quando: ${dateStr}\n📍 Postazione: ${details.stationName}\n✂️ Servizio: ${details.serviceLabel}\n\nTi aspettiamo!`;

  await sendWhatsAppMessage({ to: profile.phone, message });
}
