import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

async function loadDotEnvFile(fileName) {
  try {
    const content = await readFile(resolve(process.cwd(), fileName), "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalIndex = line.indexOf("=");
      if (equalIndex <= 0) continue;
      const key = line.slice(0, equalIndex).trim();
      const value = line.slice(equalIndex + 1).trim();
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    return;
  }
}

async function main() {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = "testclient@dogwash24.it";
  const password = "password123";

  if (!url || !serviceKey) {
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // Rimuovi l'utente se esiste già
  const { data: list } = await supabase.auth.admin.listUsers();
  const existing = list?.users?.find(u => u.email === email);
  if (existing) {
    console.log("Rimuovo utente di test esistente...");
    await supabase.auth.admin.deleteUser(existing.id);
  }

  // Crea l'utente
  const { data: newUser, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role: "customer" // esplicito customer
    }
  });

  if (error) throw error;
  console.log(`Utente test creato con successo: ${email} (password: ${password})`, newUser.user?.id);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
