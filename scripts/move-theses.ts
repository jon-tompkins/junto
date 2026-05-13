/* Move theses + personal source from one user to another.
   Usage:
     FROM_EMAIL=jonto2121@gmail.com TO_TWITTER=jonto21 npx tsx scripts/move-theses.ts
*/
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const fromEmail = process.env.FROM_EMAIL!;
  const toTwitter = process.env.TO_TWITTER!;
  if (!fromEmail || !toTwitter) {
    console.error('Set FROM_EMAIL and TO_TWITTER');
    process.exit(1);
  }

  const { data: from } = await supabase
    .from('users')
    .select('id, email, twitter_handle')
    .ilike('email', fromEmail)
    .single();
  const { data: to } = await supabase
    .from('users')
    .select('id, email, twitter_handle')
    .ilike('twitter_handle', toTwitter)
    .single();

  if (!from || !to) {
    console.error('User(s) not found', { from, to });
    process.exit(1);
  }

  console.log(`FROM: ${from.id}  ${from.email}  @${from.twitter_handle}`);
  console.log(`TO:   ${to.id}  ${to.email}  @${to.twitter_handle}\n`);

  if (from.id === to.id) {
    console.log('Same user — nothing to do.');
    return;
  }

  // 1. Move theses
  const { data: movedTheses, error: tErr } = await supabase
    .from('theses')
    .update({ user_id: to.id })
    .eq('user_id', from.id)
    .select('id, slug');
  if (tErr) throw tErr;
  console.log(`Moved ${movedTheses?.length || 0} theses`);

  // 2. Get-or-create destination personal source
  let toPersonalId: string;
  const { data: existingSrc } = await supabase
    .from('sources')
    .select('id')
    .eq('type', 'personal')
    .eq('handle_or_url', to.id)
    .maybeSingle();

  if (existingSrc) {
    toPersonalId = existingSrc.id;
    console.log(`Using existing destination personal source: ${toPersonalId}`);
  } else {
    const { data: created, error } = await supabase
      .from('sources')
      .insert({
        type: 'personal',
        handle_or_url: to.id,
        display_name: 'Personal source',
        is_active: true,
        metadata: { source_type: 'user_personal' },
      })
      .select('id')
      .single();
    if (error) throw error;
    toPersonalId = created.id;
    console.log(`Created destination personal source: ${toPersonalId}`);
  }

  // 3. Find source personal source
  const { data: fromSrc } = await supabase
    .from('sources')
    .select('id')
    .eq('type', 'personal')
    .eq('handle_or_url', from.id)
    .maybeSingle();
  if (!fromSrc) {
    console.log('No source personal source found — done.');
    return;
  }

  // 4. Repoint trades and thesis_sources
  const { count: tradeCount } = await supabase
    .from('thesis_trades')
    .update({ source_id: toPersonalId })
    .eq('source_id', fromSrc.id)
    .select('id', { count: 'exact', head: true });
  console.log(`Repointed trades: ${tradeCount}`);

  const { count: srcCount } = await supabase
    .from('thesis_sources')
    .update({ source_id: toPersonalId })
    .eq('source_id', fromSrc.id)
    .select('id', { count: 'exact', head: true });
  console.log(`Repointed thesis_sources: ${srcCount}`);

  // 5. Delete the now-empty source personal source
  const { error: delErr } = await supabase.from('sources').delete().eq('id', fromSrc.id);
  if (delErr) console.warn(`Could not delete old personal source: ${delErr.message}`);
  else console.log(`Deleted old personal source ${fromSrc.id}`);

  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
