#!/bin/bash
# Watchlist Tweet Scraper
# Runs on Ubuntu server, uses bird CLI to fetch tweets, sends to Junto API
# Usage: ./watchlist-scraper.sh [--api-url URL] [--cron-secret SECRET] [--auth-token TOKEN] [--ct0 CT0]

set -e

# Config
API_URL="${JUNTO_API_URL:-https://www.myjunto.xyz}"
CRON_SECRET="${JUNTO_CRON_SECRET:-}"
BIRD_AUTH_TOKEN="${AUTH_TOKEN:-}"
BIRD_CT0="${CT0:-}"

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --api-url) API_URL="$2"; shift 2 ;;
    --cron-secret) CRON_SECRET="$2"; shift 2 ;;
    --auth-token) BIRD_AUTH_TOKEN="$2"; shift 2 ;;
    --ct0) BIRD_CT0="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Try to load from bird config if not set
if [ -z "$BIRD_AUTH_TOKEN" ] && [ -f ~/.config/bird/config.json5 ]; then
  BIRD_AUTH_TOKEN=$(grep -oP 'authToken:\s*"\K[^"]+' ~/.config/bird/config.json5 2>/dev/null || true)
  BIRD_CT0=$(grep -oP 'ct0:\s*"\K[^"]+' ~/.config/bird/config.json5 2>/dev/null || true)
fi

# Build bird auth args
BIRD_AUTH=""
if [ -n "$BIRD_AUTH_TOKEN" ] && [ -n "$BIRD_CT0" ]; then
  BIRD_AUTH="--auth-token $BIRD_AUTH_TOKEN --ct0 $BIRD_CT0"
fi

echo "🔍 Starting watchlist scraper..."
echo "   API: $API_URL"

# Build auth header
AUTH_HEADER=""
if [ -n "$CRON_SECRET" ]; then
  AUTH_HEADER="-H \"Authorization: Bearer $CRON_SECRET\""
fi

# Get tickers to scrape
echo "📋 Fetching ticker list..."
TICKERS_RESPONSE=$(curl -s -X GET "$API_URL/api/cron/watchlist-scrape" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

# Check for error
if echo "$TICKERS_RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
  echo "❌ Error fetching tickers: $(echo "$TICKERS_RESPONSE" | jq -r '.error')"
  exit 1
fi

# Extract tickers
TICKERS=$(echo "$TICKERS_RESPONSE" | jq -r '.tickers[]' 2>/dev/null)

if [ -z "$TICKERS" ]; then
  echo "⚠️  No tickers found in watchlists"
  exit 0
fi

TICKER_COUNT=$(echo "$TICKERS" | wc -l)
echo "   Found $TICKER_COUNT tickers to process"

# Process each ticker
TOTAL_STORED=0

for TICKER in $TICKERS; do
  echo ""
  echo "🔎 Processing \$$TICKER..."
  
  # Search for tweets using bird CLI
  # Format: $TICKER (cashtag search)
  TWEETS=$(bird search "\$$TICKER" -n 30 --json $BIRD_AUTH 2>/dev/null || echo "[]")
  
  # Check if we got valid JSON
  if ! echo "$TWEETS" | jq -e '.' > /dev/null 2>&1; then
    echo "   ⚠️  Failed to fetch tweets for $TICKER"
    continue
  fi
  
  TWEET_COUNT=$(echo "$TWEETS" | jq 'length')
  echo "   Found $TWEET_COUNT tweets"
  
  if [ "$TWEET_COUNT" -eq 0 ]; then
    continue
  fi
  
  # Send to API for processing and storage
  STORE_RESPONSE=$(curl -s -X POST "$API_URL/api/cron/watchlist-scrape" \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json" \
    -d "{\"ticker\": \"$TICKER\", \"tweets\": $TWEETS}")
  
  # Check result
  if echo "$STORE_RESPONSE" | jq -e '.success' > /dev/null 2>&1; then
    STORED=$(echo "$STORE_RESPONSE" | jq -r '.stored')
    echo "   ✅ Stored $STORED quality tweets"
    TOTAL_STORED=$((TOTAL_STORED + STORED))
  else
    echo "   ⚠️  Failed to store: $(echo "$STORE_RESPONSE" | jq -r '.error // "unknown error"')"
  fi
  
  # Rate limit between tickers
  sleep 2
done

# Cleanup old tweets
echo ""
echo "🧹 Cleaning up old tweets..."
curl -s -X DELETE "$API_URL/api/cron/watchlist-scrape" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" > /dev/null

echo ""
echo "✅ Done! Stored $TOTAL_STORED tweets across $TICKER_COUNT tickers"
