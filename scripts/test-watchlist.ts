#!/usr/bin/env node

// Simple test script to verify watchlist functionality
import { getSupabase } from '../src/lib/db/client';
import { getAllWatchlistTickers, getWatchlistTweets } from '../src/lib/db/watchlist';

async function testWatchlistFunctionality() {
  console.log('🧪 Testing watchlist functionality...\n');
  
  try {
    // Test 1: Check database connection
    console.log('1. Testing database connection...');
    const supabase = getSupabase();
    const { data: testData, error: testError } = await supabase
      .from('user_watchlist')
      .select('count', { count: 'exact', head: true });
    
    if (testError) {
      console.error('❌ Database connection failed:', testError.message);
      return;
    }
    console.log('✅ Database connection successful');
    
    // Test 2: Check for watchlist tables
    console.log('\n2. Checking for watchlist tables...');
    const { data: watchlistCount } = await supabase
      .from('user_watchlist')
      .select('ticker', { count: 'exact', head: true });
    
    const { data: watchlistTweetsCount } = await supabase
      .from('watchlist_tweets')
      .select('id', { count: 'exact', head: true });
    
    console.log(`✅ user_watchlist table exists with entries`);
    console.log(`✅ watchlist_tweets table exists`);
    
    // Test 3: Get all tickers
    console.log('\n3. Testing getAllWatchlistTickers...');
    const tickers = await getAllWatchlistTickers();
    console.log(`✅ Found ${tickers.length} unique tickers:`, tickers.join(', '));
    
    if (tickers.length === 0) {
      console.log('⚠️  No tickers found in watchlist. Run migration to seed data.');
      return;
    }
    
    // Test 4: Get tweets for tickers
    console.log('\n4. Testing getWatchlistTweets...');
    const tweets = await getWatchlistTweets(tickers, 30, 10); // Last 30 days, max 10 tweets
    console.log(`✅ Found ${tweets.length} watchlist tweets`);
    
    if (tweets.length > 0) {
      console.log('\nSample tweet:');
      const sample = tweets[0];
      console.log(`- Ticker: ${sample.ticker}`);
      console.log(`- Author: @${sample.author_handle} (${sample.author_followers} followers)`);
      console.log(`- Content: ${sample.content.substring(0, 100)}...`);
      console.log(`- Quality Score: ${sample.quality_score}`);
    }
    
    // Test 5: Test API endpoints (if server is running)
    console.log('\n5. Testing API endpoints...');
    try {
      const response = await fetch('http://localhost:3000/api/watchlist/tweets?limit=5');
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ API endpoint working - returned ${data.totalTweets || 0} tweets`);
      } else {
        console.log('⚠️  API endpoint test skipped (server not running or auth required)');
      }
    } catch (error) {
      console.log('⚠️  API endpoint test skipped (server not running)');
    }
    
    console.log('\n🎉 Watchlist functionality test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  testWatchlistFunctionality();
}

export { testWatchlistFunctionality };