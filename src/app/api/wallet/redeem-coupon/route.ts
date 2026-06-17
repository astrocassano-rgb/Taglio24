import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = (await createSupabaseServerClient()) as any;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  let code = "";
  try {
    const body = await request.json();
    code = typeof body?.code === "string" ? body.code.trim() : "";
  } catch {
    return Response.json({ error: "Formato richiesta non valido" }, { status: 400 });
  }

  if (!code) {
    return Response.json({ error: "Codice promozionale mancante" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("redeem_coupon_code", {
    p_code: code
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  const result = Array.isArray(data) ? data[0] : data;
  
  if (!result || !result.applied) {
    return Response.json({ error: "Codice non applicato o già utilizzato." }, { status: 400 });
  }

  return Response.json({
    ok: true,
    applied: true,
    balance_credits: result.balance_credits,
    amount_credits: result.amount_credits
  });
}
