#!/usr/bin/env node

// Test the scheduling logic with Jon's exact data
// Simulates: preferred_send_time: 12:22:00, timezone: America/Los_Angeles
// Cron runs at 12:25 PT - should find user as "due"

function getCurrentTimeInTimezone(timezone) {
  try {
    const now = new Date();
    return now.toLocaleTimeString('en-GB', { 
      timeZone: timezone, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false 
    });
  } catch (e) {
    console.warn(`Invalid timezone ${timezone}, using UTC`);
    return new Date().toISOString().substr(11, 8);
  }
}

function getCurrentDateInTimezone(timezone) {
  try {
    const now = new Date();
    // Format: YYYY-MM-DD
    const parts = now.toLocaleDateString('en-CA', { timeZone: timezone }).split('/');
    return parts[0]; // en-CA gives YYYY-MM-DD format
  } catch (e) {
    console.warn(`Invalid timezone ${timezone}, using UTC`);
    return new Date().toISOString().split('T')[0];
  }
}

function hasTimePassed(preferredTime, currentTime) {
  const [prefH, prefM] = preferredTime.split(':').map(Number);
  const [curH, curM] = currentTime.split(':').map(Number);
  
  if (curH > prefH) return true;
  if (curH === prefH && curM >= prefM) return true;
  return false;
}

function isWeekendInTimezone(timezone) {
  try {
    const now = new Date();
    const dayName = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'short' });
    return dayName === 'Sat' || dayName === 'Sun';
  } catch (e) {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  }
}

function normalizeDateToYYYYMMDD(dateStr) {
  if (!dateStr) return null;
  
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Try parsing as a date string (handles "Mon Feb 03 2026" etc)
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      console.warn(`Invalid date string: ${dateStr}`);
      return null;
    }
    // Format as YYYY-MM-DD
    return date.toISOString().split('T')[0];
  } catch (e) {
    console.warn(`Failed to parse date: ${dateStr}`, e);
    return null;
  }
}

// Test with Jon's data
console.log('🧪 Testing scheduling logic with Jon\'s data...\n');

const testUser = {
  email: 'jonto2121@gmail.com',
  preferred_send_time: '12:22:00',
  timezone: 'America/Los_Angeles',
  last_newsletter_sent: null,  // First time
  send_frequency: 'daily',
  weekend_delivery: true
};

// Simulate current time at 12:25 PT (when cron ran)
const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
const originalToLocaleDateString = Date.prototype.toLocaleDateString;

// Mock current time to be 12:25:00 PT on Feb 3, 2026
Date.prototype.toLocaleTimeString = function(locale, options) {
  if (options && options.timeZone === 'America/Los_Angeles') {
    return '12:25:00';  // Simulated current time
  }
  return originalToLocaleTimeString.call(this, locale, options);
};

Date.prototype.toLocaleDateString = function(locale, options) {
  if (options && options.timeZone === 'America/Los_Angeles') {
    return '2026-02-03';  // Simulated current date
  }
  if (locale === 'en-CA' && options && options.timeZone === 'America/Los_Angeles') {
    return '2026-02-03';
  }
  return originalToLocaleDateString.call(this, locale, options);
};

console.log('Test Scenario:');
console.log(`- User: ${testUser.email}`);
console.log(`- Preferred send time: ${testUser.preferred_send_time}`);
console.log(`- Timezone: ${testUser.timezone}`);
console.log(`- Last newsletter sent: ${testUser.last_newsletter_sent}`);
console.log(`- Send frequency: ${testUser.send_frequency}`);
console.log(`- Weekend delivery: ${testUser.weekend_delivery}`);

console.log('\nCurrent time check:');
const userLocalNow = getCurrentTimeInTimezone(testUser.timezone);
const userLocalDate = getCurrentDateInTimezone(testUser.timezone);
console.log(`- Current time in ${testUser.timezone}: ${userLocalNow}`);
console.log(`- Current date in ${testUser.timezone}: ${userLocalDate}`);

console.log('\nStep-by-step evaluation:');

// 1. Check if time has passed
const timeHasPassed = hasTimePassed(testUser.preferred_send_time, userLocalNow);
console.log(`1. Time check: ${testUser.preferred_send_time} vs ${userLocalNow} => ${timeHasPassed ? 'PASS' : 'FAIL'}`);

// 2. Check weekend delivery
const isWeekend = isWeekendInTimezone(testUser.timezone);
console.log(`2. Weekend check: is weekend? ${isWeekend}, weekend delivery enabled? ${testUser.weekend_delivery} => ${(!isWeekend || testUser.weekend_delivery) ? 'PASS' : 'FAIL'}`);

// 3. Check frequency
const lastSent = testUser.last_newsletter_sent;
const normalizedLastSent = normalizeDateToYYYYMMDD(lastSent);
console.log(`3. Frequency check:`);
console.log(`   - Last sent: ${lastSent}`);
console.log(`   - Normalized: ${normalizedLastSent}`);
console.log(`   - Current date: ${userLocalDate}`);

let shouldSend = false;
if (!normalizedLastSent) {
  shouldSend = true;
  console.log(`   - Result: PASS (never sent before)`);
} else {
  shouldSend = normalizedLastSent < userLocalDate;
  console.log(`   - Result: ${shouldSend ? 'PASS' : 'FAIL'} (${normalizedLastSent} < ${userLocalDate})`);
}

const overallResult = timeHasPassed && (!isWeekend || testUser.weekend_delivery) && shouldSend;

console.log(`\n🎯 Final Result: ${overallResult ? '✅ USER IS DUE FOR NEWSLETTER' : '❌ USER NOT DUE'}`);

if (overallResult) {
  console.log('✨ This user should be included in the scheduled send!');
} else {
  console.log('❌ Something is filtering this user out.');
}

// Test with legacy date format too
console.log('\n🧪 Testing with legacy date format...');
const testUserWithLegacyDate = {
  ...testUser,
  last_newsletter_sent: 'Mon Feb 02 2026'  // Yesterday in legacy format
};

const legacyNormalized = normalizeDateToYYYYMMDD(testUserWithLegacyDate.last_newsletter_sent);
const legacyShouldSend = legacyNormalized < userLocalDate;
console.log(`Legacy date: ${testUserWithLegacyDate.last_newsletter_sent}`);
console.log(`Normalized: ${legacyNormalized}`);
console.log(`Should send: ${legacyShouldSend ? 'YES' : 'NO'} (${legacyNormalized} < ${userLocalDate})`);

// Restore original methods
Date.prototype.toLocaleTimeString = originalToLocaleTimeString;
Date.prototype.toLocaleDateString = originalToLocaleDateString;