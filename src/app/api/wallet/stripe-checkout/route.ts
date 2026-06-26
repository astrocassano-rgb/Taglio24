import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantFromHost } from "@/lib/tenant";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const packs = {
  starter: { title: "Starter", subtitle: "10€ = 10 crediti", price: 10, credits: 10 },
  premium: { title: "Premium", subtitle: "25€ = 30 crediti", price: 25, credits: 30 },
  max: { title: "Max", subtitle: "50€ = 65 crediti", price: 50, credits: 65 }
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  if (!stripe) {
    return Response.json(
      { error: "Stripe non configurato sul server. Verifica STRIPE_SECRET_KEY nelle env." },
      { status: 500 }
    );
  }

  let packId: "starter" | "premium" | "max" = "starter";
  try {
    const body = await request.json().catch(() => ({}));
    if (body.pack === "starter" || body.pack === "premium" || body.pack === "max") {
      packId = body.pack;
    }
  } catch {
    // default starter
  }

  const selectedPack = packs[packId];
  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const tenant = (await getTenantFromHost()) as any;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: `Ricarica DogWash24 — ${selectedPack.title}`,
              description: selectedPack.subtitle,
            },
            unit_amount: selectedPack.price * 100, // Stripe lavora in centesimi
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/wallet?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/wallet?cancelled=true`,
      client_reference_id: user.id,
      metadata: {
        pack: packId,
        credits: String(selectedPack.credits),
        price: String(selectedPack.price),
        tenant_id: tenant?.id || "",
      },
    });

    return Response.json({ url: session.url });
  } catch (error: any) {
    return Response.json({ error: error?.message ?? "Errore di checkout" }, { status: 500 });
  }
}
