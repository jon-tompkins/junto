#!/bin/bash
# run-xai-fetch.sh - Wrapper for xAI tweet fetcher

set -e

cd "$(dirname "$0")"

# Load environment
source ~/clawd/.env.myjunto

# Ensure XAI key is set
if [ -z "$XAI_API_KEY" ]; then
    echo "Error: XAI_API_KEY not set"
    exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Running xAI tweet fetch..."
python3 xai-fetch-tweets.py

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Done"
