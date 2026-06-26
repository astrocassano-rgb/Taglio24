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

  if (!url || !serviceKey) {
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });
  if (error) throw new Error(error.message);

  const users = data?.users ?? [];
  console.log("Elenco utenti registrati (ultimi 50):");
  users.forEach((u) => {
    console.log(`- Email: ${u.email} | ID: ${u.id} | Ruolo: ${u.app_metadata?.role || "nessuno"} | Creato il: ${u.created_at}`);
  });
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
