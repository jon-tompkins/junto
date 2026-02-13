#!/bin/bash
# Wrapper script for cron - loads auth tokens and runs scraper
cd ~/clawd/junto-app/scripts
./watchlist-scraper.sh --api-url https://www.myjunto.xyz --cron-secret junto-cron-secret-123 >> /tmp/watchlist-scraper.log 2>&1
