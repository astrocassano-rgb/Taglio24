// Script temporaneo per applicare le migrazioni SQL su Supabase
// usando il client @supabase/supabase-js con service_role key
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from 'dotenv';

// Carica .env.local
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Variabili NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti');
  process.exit(1);
}

// Client con service role bypassa RLS
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

const migrations = [
  'supabase/migrations/0018_fix_availability_rls_bypass.sql',
  'supabase/migrations/0019_fix_create_booking_overlap_check.sql',
];

for (const migPath of migrations) {
  const sql = readFileSync(migPath, 'utf-8');
  console.log(`\n▶ Applying: ${migPath}`);
  
  // Usa rpc con una funzione che esegue SQL raw — approach alternativo:
  // Supabase non espone exec_sql direttamente, ma possiamo usare
  // l'endpoint /rest/v1/ con header Content-Type: application/sql
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
    console.log(`  ℹ Status: ${res.status} — ${text}`);
  }
}

console.log('\n✅ Script completato.');
