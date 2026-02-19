#!/bin/bash
# Wrapper script for cron - loads auth tokens and runs scraper
export AUTH_TOKEN="1fa939cb15251b1fafa4ba72215208aaa004320c"
export CT0="e0b2cd59f577a60a3b5969d698a5f06cd82c862db90368dc609974eb2ea7be107d6788b24f2ad3fb71e5abb762c65e2bb2027534facc7d283c92a7c044ff27bb52ad788b95a717522a793d803431d4bc"
cd ~/clawd/junto-app/scripts
./watchlist-scraper.sh --api-url https://www.myjunto.xyz --cron-secret junto-cron-secret-123 >> /tmp/watchlist-scraper.log 2>&1
