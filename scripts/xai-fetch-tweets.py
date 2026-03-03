#!/usr/bin/env python3
"""
xai-fetch-tweets.py - Fetch tweets via xAI Grok x_search and store in MyJunto Supabase

Uses xAI's native X integration - much more reliable than cookie-based scraping.

Usage:
    export XAI_API_KEY="xai-..."
    export MYJUNTO_SUPABASE_URL="https://..."
    export MYJUNTO_SUPABASE_SERVICE_KEY="..."
    python3 xai-fetch-tweets.py
"""

import os
import json
import re
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import requests

from xai_sdk import Client
from xai_sdk.chat import user
from xai_sdk.tools import x_search

# Configuration
XAI_API_KEY = os.environ.get("XAI_API_KEY")
SUPABASE_URL = os.environ.get("MYJUNTO_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("MYJUNTO_SUPABASE_SERVICE_KEY")
MAX_HANDLES_PER_REQUEST = 10

def get_profiles() -> List[Dict[str, Any]]:
    """Fetch all profiles from Supabase"""
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/profiles?select=id,twitter_handle",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}"
        }
    )
    return response.json()

def batch_handles(profiles: List[Dict], batch_size: int = MAX_HANDLES_PER_REQUEST) -> List[List[Dict]]:
    """Split profiles into batches of max 10"""
    return [profiles[i:i + batch_size] for i in range(0, len(profiles), batch_size)]

def parse_tweet_from_text(text_block: str, handle: str) -> Optional[Dict]:
    """Parse a tweet from a text block"""
    tweet = {
        'author': handle,
        'text': '',
        'timestamp': '',
        'url': '',
    }
    
    # Extract text - look for "Full tweet text:" or "text:" or just grab the main content
    text_match = re.search(r'(?:Full tweet text|Tweet|text)[:\s]*(.+?)(?=\n\s*\*\*|Timestamp|$)', text_block, re.IGNORECASE | re.DOTALL)
    if text_match:
        tweet['text'] = text_match.group(1).strip().strip('"\'')
    
    # If no explicit text field, use the whole block minus metadata
    if not tweet['text']:
        # Remove author/timestamp lines and use the rest
        cleaned = re.sub(r'\*\*Author\*\*:.*?\n', '', text_block)
        cleaned = re.sub(r'\*\*Timestamp\*\*:.*?\n', '', cleaned)
        cleaned = re.sub(r'@\w+', '', cleaned)
        tweet['text'] = cleaned.strip().strip('-*').strip()
    
    # Extract timestamp
    ts_match = re.search(r'(?:Timestamp|Posted|Date)[:\s]*([A-Za-z]{3},?\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+[\d:]+(?:\s*[A-Z]{2,4})?|\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2})', text_block, re.IGNORECASE)
    if ts_match:
        tweet['timestamp'] = ts_match.group(1).strip()
    
    return tweet if tweet['text'] else None

def fetch_tweets_for_handles(handles: List[str], hours: int = 24) -> Dict[str, List[Dict]]:
    """Fetch recent tweets for a batch of handles using xAI x_search"""
    client = Client(api_key=XAI_API_KEY)
    
    from_date = datetime.now() - timedelta(hours=hours)
    to_date = datetime.now()
    
    chat = client.chat.create(
        model="grok-4-1-fast-reasoning",
        tools=[
            x_search(
                allowed_x_handles=handles,
                from_date=from_date,
                to_date=to_date,
            )
        ],
    )
    
    # Build a detailed prompt
    handles_str = ", ".join([f"@{h}" for h in handles])
    prompt = f"""For these Twitter/X accounts: {handles_str}

List ALL tweets from the past {hours} hours.

For EACH tweet, format EXACTLY like this:
---
@handle
Tweet: [full tweet text here]
Time: [timestamp]
---

List every tweet you find. If an account has no tweets in this period, skip it."""

    chat.append(user(prompt))
    
    try:
        response = chat.sample()
        content = response.content
        citations = response.citations if hasattr(response, 'citations') else []
        
        tweets_by_handle = {h.lower(): [] for h in handles}
        
        # Split by --- or ### or ** headers
        sections = re.split(r'(?:^---+$|^###\s*@|^\*\*@)', content, flags=re.MULTILINE)
        
        # Also try splitting by @handle patterns
        if len(sections) <= 1:
            sections = re.split(r'(?=(?:^|\n)-?\s*\*?\*?@\w+)', content)
        
        for section in sections:
            section = section.strip()
            if not section:
                continue
            
            # Find which handle this section is about
            handle_match = re.search(r'@(\w+)', section)
            if handle_match:
                handle = handle_match.group(1).lower()
                if handle in tweets_by_handle:
                    # Extract tweet text
                    text_match = re.search(r'(?:Tweet|Full tweet text|text)[:\s]*(.+?)(?=\nTime|\nTimestamp|$)', section, re.IGNORECASE | re.DOTALL)
                    if text_match:
                        tweet_text = text_match.group(1).strip().strip('"\'')
                    else:
                        # Try to get text after the handle mention
                        lines = section.split('\n')
                        tweet_text = ''
                        for line in lines[1:]:  # Skip first line with handle
                            if not re.match(r'^(Time|Timestamp|Posted):', line, re.IGNORECASE):
                                tweet_text += line.strip() + ' '
                        tweet_text = tweet_text.strip()
                    
                    # Extract timestamp
                    ts_match = re.search(r'(?:Time|Timestamp|Posted)[:\s]*(.+?)(?:\n|$)', section, re.IGNORECASE)
                    timestamp = ts_match.group(1).strip() if ts_match else ''
                    
                    if tweet_text and len(tweet_text) > 10:
                        tweets_by_handle[handle].append({
                            'author': f'@{handle}',
                            'text': tweet_text,
                            'timestamp': timestamp,
                            'url': ''
                        })
        
        # Add citations as URLs where possible
        for url in citations:
            for handle in tweets_by_handle:
                if handle in url.lower():
                    for tweet in tweets_by_handle[handle]:
                        if not tweet['url']:
                            tweet['url'] = url
                            break
        
        return tweets_by_handle
        
    except Exception as e:
        print(f"  Error fetching tweets: {e}")
        import traceback
        traceback.print_exc()
        return {}

def store_tweets(profile_id: str, handle: str, tweets: List[Dict]) -> int:
    """Store tweets in Supabase"""
    if not tweets:
        return 0
    
    batch = []
    for tweet in tweets:
        # Parse timestamp
        ts = tweet.get('timestamp', '')
        posted_at = datetime.now().isoformat()
        if ts:
            # Try various formats
            for fmt in [
                '%a, %d %b %Y %H:%M:%S %Z',
                '%a, %d %b %Y %H:%M:%S',
                '%Y-%m-%dT%H:%M:%S',
                '%Y-%m-%d %H:%M:%S',
                '%d %b %Y %H:%M:%S',
            ]:
                try:
                    posted_at = datetime.strptime(ts.strip(), fmt).isoformat()
                    break
                except:
                    continue
        
        # Extract tweet ID from URL if available
        url = tweet.get('url', '')
        twitter_id = None
        if url:
            match = re.search(r'/status/(\d+)', url)
            if match:
                twitter_id = match.group(1)
        
        # Generate a pseudo-ID if none
        if not twitter_id:
            twitter_id = f"xai_{handle}_{hash(tweet['text'][:50]) % 10000000000}"
        
        batch.append({
            'profile_id': profile_id,
            'twitter_id': twitter_id,
            'content': tweet.get('text', ''),
            'posted_at': posted_at,
            'likes': tweet.get('likes', 0),
            'retweets': tweet.get('retweets', 0),
            'replies': tweet.get('replies', 0),
            'is_retweet': tweet.get('is_retweet', False) or tweet.get('text', '').startswith('RT @'),
            'is_reply': tweet.get('is_reply', False),
            'is_quote_tweet': tweet.get('is_quote_tweet', False),
            'raw_data': tweet
        })
    
    if not batch:
        return 0
    
    # Upsert to Supabase
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/tweets",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        json=batch
    )
    
    if response.status_code in [200, 201]:
        return len(batch)
    else:
        print(f"  Failed to store tweets: {response.status_code} - {response.text[:200]}")
        return 0

def update_profile_last_fetched(profile_id: str):
    """Update the last_fetched_at timestamp for a profile"""
    requests.patch(
        f"{SUPABASE_URL}/rest/v1/profiles?id=eq.{profile_id}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json"
        },
        json={"last_fetched_at": datetime.now().isoformat()}
    )

def main():
    print(f"[{datetime.now().isoformat()}] Starting xAI tweet fetch...")
    
    if not all([XAI_API_KEY, SUPABASE_URL, SUPABASE_KEY]):
        print("Missing required environment variables")
        print(f"  XAI_API_KEY: {'set' if XAI_API_KEY else 'missing'}")
        print(f"  MYJUNTO_SUPABASE_URL: {'set' if SUPABASE_URL else 'missing'}")
        print(f"  MYJUNTO_SUPABASE_SERVICE_KEY: {'set' if SUPABASE_KEY else 'missing'}")
        return
    
    # Get all profiles
    profiles = get_profiles()
    print(f"Found {len(profiles)} profiles")
    
    if not profiles:
        print("No profiles found!")
        return
    
    # Build handle -> profile_id mapping
    handle_to_profile = {
        p['twitter_handle'].lower(): p['id'] 
        for p in profiles 
        if p.get('twitter_handle')
    }
    
    # Batch handles
    handles = list(handle_to_profile.keys())
    batches = batch_handles([{'handle': h, 'profile_id': handle_to_profile[h]} for h in handles])
    
    print(f"Processing {len(batches)} batches of up to {MAX_HANDLES_PER_REQUEST} handles each")
    
    total_stored = 0
    
    for i, batch in enumerate(batches):
        batch_handles_list = [p['handle'] for p in batch]
        print(f"\nBatch {i+1}/{len(batches)}: {', '.join(batch_handles_list[:5])}{'...' if len(batch_handles_list) > 5 else ''}")
        
        # Fetch tweets for this batch
        tweets_by_handle = fetch_tweets_for_handles(batch_handles_list)
        
        # Store tweets for each profile
        for profile in batch:
            handle = profile['handle'].lower()
            profile_id = profile['profile_id']
            
            tweets = tweets_by_handle.get(handle, [])
            if tweets:
                stored = store_tweets(profile_id, handle, tweets)
                print(f"  @{handle}: stored {stored} tweets")
                total_stored += stored
            else:
                print(f"  @{handle}: no tweets found")
            
            # Update last_fetched_at
            update_profile_last_fetched(profile_id)
    
    print(f"\n[{datetime.now().isoformat()}] Complete! Stored {total_stored} tweets total")

if __name__ == "__main__":
    main()
