/* Quick sanity check: how many theses for the user, what statuses */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function main() {
  const { data: users } = await supabase
    .from('users')
    .select('id, email, twitter_handle, twitter_id, google_id')
    .ilike('email', 'jonto2121@gmail.com')
    .limit(5);

  console.log('Users matching email:', JSON.stringify(users, null, 2));

  for (const u of users || []) {
    const { count, data } = await supabase
      .from('theses')
      .select('slug, status, conviction', { count: 'exact' })
      .eq('user_id', u.id)
      .limit(20);

    console.log(`\nUser ${u.id} (${u.twitter_handle || u.email}): ${count} theses`);
    for (const t of data || []) {
      console.log(`  ${t.status.padEnd(12)} c${t.conviction}  ${t.slug}`);
    }
  }

  // Also check for any duplicate user records
  const { data: allUsers } = await supabase
    .from('users')
    .select('id, email, twitter_handle, twitter_id, google_id, created_at')
    .or('email.ilike.%jonto%,twitter_handle.ilike.%jonto%');
  console.log('\nAll users with jonto in email/handle:', JSON.stringify(allUsers, null, 2));
}

main();
