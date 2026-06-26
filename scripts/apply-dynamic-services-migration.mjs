import { readFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

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
    // Ignore missing env files
  }
}

async function main() {
  await loadDotEnvFile(".env.local");
  await loadDotEnvFile(".env");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ Variabili NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti');
    process.exit(1);
  }

  const migPath = 'supabase/migrations/20260627000000_dynamic_services.sql';
  const sql = readFileSync(migPath, 'utf-8');

  console.log(`\n▶ Applying dynamic services migration: ${migPath}`);

  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/sql',
    },
    body: sql,
  });

  if (res.ok) {
    console.log(`  ✅ OK (${res.status})`);
  } else {
    const text = await res.text();
    console.error(`  ❌ Status: ${res.status} — ${text}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
