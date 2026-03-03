#!/bin/bash
# bird-fetch-tweets.sh - Fetch tweets via bird-auth and push to myjunto Supabase

# Load myjunto Supabase credentials
source ~/clawd/.env.myjunto

BIRD_CLI=~/bin/bird-auth

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Starting tweet fetch..."

# Get all profiles from Supabase
echo "Fetching profiles..."
PROFILES=$(curl -s "${MYJUNTO_SUPABASE_URL}/rest/v1/profiles?select=id,twitter_handle" \
  -H "apikey: ${MYJUNTO_SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${MYJUNTO_SUPABASE_SERVICE_KEY}")

if [ -z "$PROFILES" ] || [ "$PROFILES" == "[]" ]; then
  echo "No profiles found"
  exit 0
fi

PROFILE_COUNT=$(echo "$PROFILES" | jq 'length')
echo "Found $PROFILE_COUNT profiles"

TOTAL_STORED=0

# Save profiles to temp file for iteration
TMPFILE=$(mktemp)
echo "$PROFILES" | jq -c '.[]' > "$TMPFILE"

while IFS= read -r profile; do
  PROFILE_ID=$(echo "$profile" | jq -r '.id')
  HANDLE=$(echo "$profile" | jq -r '.twitter_handle')
  
  echo ""
  echo "Fetching tweets for @${HANDLE}..."
  
  # Fetch tweets via bird-auth user-tweets
  RAW=$($BIRD_CLI user-tweets "$HANDLE" -n 30 --json 2>&1)
  
  # Check for rate limit
  if echo "$RAW" | grep -q "429"; then
    echo "  ⚠️ Rate limited, skipping"
    sleep 30
    continue
  fi
  
  # Extract JSON array (skip info lines starting with ℹ️)
  TWEETS=$(echo "$RAW" | awk '/^\[/,0' | jq -c '.' 2>/dev/null || echo "[]")
  
  if [ -z "$TWEETS" ] || [ "$TWEETS" == "[]" ]; then
    echo "  No tweets found"
    sleep 1
    continue
  fi
  
  TWEET_COUNT=$(echo "$TWEETS" | jq 'length' 2>/dev/null || echo "0")
  echo "  Got $TWEET_COUNT tweets"
  
  if [ "$TWEET_COUNT" == "0" ] || [ "$TWEET_COUNT" == "null" ]; then
    continue
  fi
  
  # Build batch insert payload
  BATCH_PAYLOAD=$(echo "$TWEETS" | jq -c --arg profile_id "$PROFILE_ID" '[.[] | {
    profile_id: $profile_id,
    twitter_id: .id,
    content: .text,
    posted_at: .createdAt,
    likes: (.likeCount // 0),
    retweets: (.retweetCount // 0),
    replies: (.replyCount // 0),
    is_retweet: ((.text // "") | startswith("RT @")),
    is_reply: (.inReplyToStatusId != null),
    is_quote_tweet: (.quotedTweet != null),
    quoted_tweet_content: (.quotedTweet.text // null),
    thread_id: .conversationId,
    raw_data: .
  }]')
  
  if [ -z "$BATCH_PAYLOAD" ] || [ "$BATCH_PAYLOAD" == "null" ] || [ "$BATCH_PAYLOAD" == "[]" ]; then
    echo "  Failed to build payload"
    continue
  fi
  
  # Upsert batch to Supabase
  RESULT=$(curl -s -X POST "${MYJUNTO_SUPABASE_URL}/rest/v1/tweets" \
    -H "apikey: ${MYJUNTO_SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${MYJUNTO_SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates,return=minimal" \
    -d "$BATCH_PAYLOAD" \
    -w "%{http_code}" -o /dev/null)
  
  if [ "$RESULT" == "201" ] || [ "$RESULT" == "200" ]; then
    echo "  ✓ Stored $TWEET_COUNT tweets"
    TOTAL_STORED=$((TOTAL_STORED + TWEET_COUNT))
  else
    echo "  ✗ Failed to store (HTTP $RESULT)"
  fi
  
  # Update profile last_fetched_at
  curl -s -X PATCH "${MYJUNTO_SUPABASE_URL}/rest/v1/profiles?id=eq.${PROFILE_ID}" \
    -H "apikey: ${MYJUNTO_SUPABASE_SERVICE_KEY}" \
    -H "Authorization: Bearer ${MYJUNTO_SUPABASE_SERVICE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"last_fetched_at\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > /dev/null
  
  # Rate limit protection - 5s between profiles to avoid 429
  sleep 5
done < "$TMPFILE"

rm -f "$TMPFILE"

echo ""
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Tweet fetch complete! Stored ~$TOTAL_STORED tweets"
