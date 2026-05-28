import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { getSupabase } from './client';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
  failed: { filename: string; error: string } | null;
}

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');

// Only files matching NNN_name.sql are auto-applied. Loose seed/helper files
// (create-watchlist-tables.sql, seed-watchlist.sql) are skipped on purpose.
function isMigrationFile(name: string): boolean {
  return /^\d{3}_.+\.sql$/.test(name);
}

export async function runPendingMigrations(): Promise<MigrationResult> {
  const supabase = getSupabase();

  const entries = await readdir(MIGRATIONS_DIR);
  const files = entries.filter(isMigrationFile).sort();

  const { data: applied, error: appliedErr } = await supabase
    .from('schema_migrations')
    .select('filename');
  if (appliedErr) {
    return { applied: [], skipped: [], failed: { filename: '<schema_migrations>', error: appliedErr.message } };
  }
  const appliedSet = new Set((applied || []).map((r: any) => r.filename));

  const result: MigrationResult = { applied: [], skipped: [], failed: null };

  for (const filename of files) {
    if (appliedSet.has(filename)) {
      result.skipped.push(filename);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf-8');
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
      result.failed = { filename, error: error.message };
      return result;
    }
    const { error: insertErr } = await supabase
      .from('schema_migrations')
      .insert({ filename });
    if (insertErr) {
      result.failed = { filename, error: `applied but failed to record: ${insertErr.message}` };
      return result;
    }
    result.applied.push(filename);
  }

  return result;
}
