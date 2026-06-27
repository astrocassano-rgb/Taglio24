import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const migrationsDir = './supabase/migrations';
const outputFile = './supabase/schema_completo_taglio24.sql';

console.log('🚀 Compilazione dello schema completo per Taglio24...');

try {
  // Legge tutti i file della cartella migrations
  const files = readdirSync(migrationsDir);
  
  // Filtra solo i file .sql, ignorando i file .down.sql o file non SQL
  const sqlFiles = files
    .filter(file => file.endsWith('.sql') && !file.endsWith('.down.sql'))
    .sort(); // Ordinamento alfabetico/numerico naturale

  console.log(`\nTrovate ${sqlFiles.length} migrazioni da unire in ordine sequenziale:`);
  sqlFiles.forEach(file => console.log(`  - ${file}`));

  let compiledSql = `-- SCHEMA COMPLETO DI TAGLIO24\n`;
  compiledSql += `-- Generato automaticamente il ${new Date().toLocaleDateString('it-IT')}\n`;
  compiledSql += `-- Questo file contiene tutte le migrazioni unite ed ordinate per una configurazione pulita.\n\n`;

  for (const file of sqlFiles) {
    const filePath = join(migrationsDir, file);
    const content = readFileSync(filePath, 'utf-8');
    
    compiledSql += `\n-- --------------------------------------------------\n`;
    compiledSql += `-- INIZIO MIGRAZIONE: ${file}\n`;
    compiledSql += `-- --------------------------------------------------\n\n`;
    compiledSql += content;
    compiledSql += `\n\n`;
  }

  writeFileSync(outputFile, compiledSql, 'utf-8');
  console.log(`\n✅ Schema completo generato con successo in: ${outputFile}`);
  console.log(`Ora puoi copiare il contenuto di questo file e incollarlo direttamente nel SQL Editor di Supabase.`);

} catch (err) {
  console.error('❌ Errore durante la compilazione dello schema:', err.message);
}
