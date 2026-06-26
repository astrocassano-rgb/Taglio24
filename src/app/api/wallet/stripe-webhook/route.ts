import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function POST(request: Request) {
  if (!stripe) {
    return Response.json({ error: "Stripe non configurato sul server." }, { status: 500 });
  }

  const sig = request.headers.get("stripe-signature") ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

  let body = "";
  try {
    body = await request.text();
  } catch (err: any) {
    return Response.json({ error: "Errore lettura corpo richiesta." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err: any) {
    console.error(`[Stripe Webhook] Errore verifica firma: ${err.message}`);
    return Response.json({ error: `Errore verifica firma Stripe: ${err.message}` }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    const customerId = session.client_reference_id;
    const credits = Number(session.metadata?.credits ?? 0);
    const price = Number(session.metadata?.price ?? 0);
    const reference = String(session.payment_intent ?? session.id);

    if (!customerId || !credits) {
      console.warn("[Stripe Webhook] Dati sessione incompleti (no customerId o credits).");
      return Response.json({ error: "Dati sessione incompleti." }, { status: 400 });
    }

    try {
      const admin = createSupabaseAdminClient();

      // 1. Verifica se la transazione è già stata inserita (previene replay/duplicati)
      const { data: existingTx } = await admin
        .from("token_transactions")
        .select("id")
        .eq("stripe_intent_id", reference)
        .maybeSingle();

      if (existingTx) {
        console.log(`[Stripe Webhook] Pagamento ${reference} già processato.`);
        return Response.json({ received: true, status: "duplicate" });
      }

      const tenantId = session.metadata?.tenant_id || "00000000-0000-0000-0000-000000000000";

      // 2. Recupera o crea il wallet per l'utente legato a questo specifico tenant
      let { data: wallet } = await admin
        .from("wallets")
        .select("id, balance_credits")
        .eq("customer_id", customerId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (!wallet) {
        // Garantisce che ci sia il record di relazione cliente-tenant prima del portafoglio
        await (admin as any)
          .from("tenant_customers")
          .insert({ customer_id: customerId, tenant_id: tenantId, role: "customer" })
          .select()
          .maybeSingle();

        const { data: newWallet, error: createError } = await admin
          .from("wallets")
          .insert({ customer_id: customerId, tenant_id: tenantId, balance_credits: 0 })
          .select("id, balance_credits")
          .single();

        if (createError || !newWallet) {
          throw new Error(`Impossibile creare il wallet: ${createError?.message}`);
        }
        wallet = newWallet;
      }

      // 3. Accredito atomico — previene race condition con update SQL diretto
      // Usa balance_credits = balance_credits + N per evitare lost updates
      // Nota: (as any) necessario fino a rigenerazione tipi dopo migrazione 0016
      const { error: updateError } = await (admin as any).rpc("atomic_wallet_topup", {
        p_wallet_id: wallet.id,
        p_credits: credits
      });

      if (updateError) {
        // Fallback: aggiornamento diretto (meno sicuro ma funzionale)
        const newBalance = Number(wallet.balance_credits) + credits;
        const { error: fallbackError } = await admin
          .from("wallets")
          .update({ balance_credits: newBalance, updated_at: new Date().toISOString() })
          .eq("id", wallet.id);
        if (fallbackError) {
          throw new Error(`Errore aggiornamento saldo wallet: ${fallbackError.message}`);
        }
      }

      // Inserisci transazione CHARGE nel ledger
      const { error: txError } = await admin
        .from("token_transactions")
        .insert({
          wallet_id: wallet.id,
          tenant_id: tenantId,
          type: "CHARGE",
          amount_credits: credits,
          amount_currency: price,
          stripe_intent_id: reference,
          note: `Ricarica Stripe: Pacchetto ${session.metadata?.pack ?? "custom"}`
        });

      if (txError) {
        throw new Error(`Errore inserimento transazione ledger: ${txError.message}`);
      }

      console.log(`[Stripe Webhook] Accreditati ${credits} crediti all'utente ${customerId} per pagamento ${reference}.`);
    } catch (dbErr: any) {
      console.error(`[Stripe Webhook] Errore DB nel processare il pagamento: ${dbErr.message}`);
      return Response.json({ error: "Errore interno database" }, { status: 500 });
    }
  }

  return Response.json({ received: true });
}
