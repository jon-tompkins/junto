#!/usr/bin/env node

// Direct Supabase query to see what users exist
// This will help understand the user ID mismatch

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const SUPABASE_URL = "https://lsqlqssigerzghlxfxjl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxzcWxxc3NpZ2VyemdobHhmeGpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NDA5NTEsImV4cCI6MjA4NTExNjk1MX0.jqoZUtW_gb8rehPteVgjmLLLlPRLYV-0fNJkpLGcf-s";

async function queryUsers() {
  console.log('🔍 Querying Supabase directly for all users...\n');
  
  try {
    const { stdout } = await execAsync(`curl -s "${SUPABASE_URL}/rest/v1/users?select=*" \\
      -H "apikey: ${SUPABASE_ANON_KEY}" \\
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"`);
    
    const users = JSON.parse(stdout);
    
    console.log(`Found ${users.length} total users:`);
    
    users.forEach((user, i) => {
      console.log(`\n${i + 1}. User ID: ${user.id}`);
      console.log(`   Email: ${user.email || 'null'}`);
      console.log(`   Name: ${user.name || 'null'}`);
      console.log(`   Twitter Handle: ${user.twitter_handle || 'null'}`);
      console.log(`   Twitter ID: ${user.twitter_id || 'null'}`);
      console.log(`   Preferred Send Time: ${user.preferred_send_time || 'null'}`);
      console.log(`   Timezone: ${user.timezone || 'null'}`);
      console.log(`   Last Newsletter Sent: ${user.last_newsletter_sent || 'null'}`);
      console.log(`   Send Frequency: ${user.send_frequency || 'null'}`);
      console.log(`   Weekend Delivery: ${user.weekend_delivery}`);
      console.log(`   Settings: ${JSON.stringify(user.settings || {})}`);
      console.log(`   Created: ${user.created_at || 'null'}`);
      console.log(`   Updated: ${user.updated_at || 'null'}`);
    });
    
    // Look for any user IDs starting with 8a466f2a
    const matchingUsers = users.filter(u => u.id.startsWith('8a466f2a'));
    if (matchingUsers.length > 0) {
      console.log('\n🎯 Found users with ID starting with 8a466f2a:');
      matchingUsers.forEach(u => console.log(`   ${u.id} - ${u.email}`));
    } else {
      console.log('\n❌ No users found with ID starting with 8a466f2a (from the logs)');
    }
    
    // Check what would be returned by the scheduling query
    console.log('\n📋 Users that would match scheduling query filter:');
    const schedulingUsers = users.filter(u => 
      u.email && 
      u.preferred_send_time && 
      u.timezone
    );
    
    if (schedulingUsers.length === 0) {
      console.log('   ❌ NO USERS would match the scheduling query filters!');
      console.log('   This explains why "0 users due for newsletters" was logged.');
      
      // Analyze what's missing
      users.forEach(user => {
        const missing = [];
        if (!user.email) missing.push('email');
        if (!user.preferred_send_time) missing.push('preferred_send_time');
        if (!user.timezone) missing.push('timezone');
        
        if (missing.length > 0) {
          console.log(`   User ${user.id.substring(0, 8)}... missing: ${missing.join(', ')}`);
        }
      });
    } else {
      console.log(`   ✅ ${schedulingUsers.length} users match scheduling filters:`);
      schedulingUsers.forEach(u => {
        console.log(`   - ${u.email} (${u.preferred_send_time} ${u.timezone})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error querying database:', error.message);
  }
}

// Also test the scheduling logic conditions
async function testSchedulingLogic() {
  console.log('\n🧪 Testing scheduling logic with current database data...\n');
  
  try {
    const { stdout } = await execAsync(`curl -s "${SUPABASE_URL}/rest/v1/users?select=*&not.email=is.null&not.preferred_send_time=is.null&not.timezone=is.null" \\
      -H "apikey: ${SUPABASE_ANON_KEY}" \\
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}"`);
    
    const users = JSON.parse(stdout);
    
    if (users.length === 0) {
      console.log('❌ No users match the basic scheduling filters');
      return;
    }
    
    // Get current PT time (simulate 12:25 PM PT scenario)
    const now = new Date();
    const ptTime = now.toLocaleTimeString('en-GB', { 
      timeZone: 'America/Los_Angeles', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
    const ptDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    
    console.log(`Current time in PT: ${ptTime}`);
    console.log(`Current date in PT: ${ptDate}`);
    
    users.forEach(user => {
      console.log(`\nTesting user: ${user.email}`);
      console.log(`Preferred time: ${user.preferred_send_time}`);
      console.log(`Timezone: ${user.timezone}`);
      
      // Get user's current local time
      const userTime = now.toLocaleTimeString('en-GB', { 
        timeZone: user.timezone, 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: false 
      });
      
      console.log(`User's current local time: ${userTime}`);
      
      // Check if preferred time has passed
      const [prefH, prefM] = user.preferred_send_time.split(':').map(Number);
      const [curH, curM] = userTime.split(':').map(Number);
      
      const timeHasPassed = curH > prefH || (curH === prefH && curM >= prefM);
      console.log(`Time check: ${timeHasPassed ? 'PASS' : 'FAIL'} (${user.preferred_send_time} vs ${userTime})`);
      
      // Check if already sent today
      const hasNotSentToday = !user.last_newsletter_sent || user.last_newsletter_sent < ptDate;
      console.log(`Frequency check: ${hasNotSentToday ? 'PASS' : 'FAIL'} (last sent: ${user.last_newsletter_sent || 'never'})`);
      
      const isDue = timeHasPassed && hasNotSentToday;
      console.log(`🎯 Result: ${isDue ? '✅ DUE' : '❌ NOT DUE'}`);
    });
    
  } catch (error) {
    console.error('❌ Error testing scheduling logic:', error.message);
  }
}

queryUsers().then(() => testSchedulingLogic());