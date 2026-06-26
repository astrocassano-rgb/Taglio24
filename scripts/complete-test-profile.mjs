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
  const userId = "77f42e37-e754-4795-93e8-cd34a98588ad";

  if (!url || !serviceKey) {
    throw new Error("Mancano NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    first_name: "Test",
    last_name: "Client",
    phone: "+39123456789",
    tenant_id: "00000000-0000-0000-0000-000000000000" // default tenant
  });

  if (error) throw error;
  console.log(`Profilo dell'utente test completato nel database.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
