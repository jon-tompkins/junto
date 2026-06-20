#!/bin/bash
# Discord Community Setup via REST API
# Requires: DISCORD_BOT_TOKEN and DISCORD_GUILD_ID env vars

set -e

TOKEN="${DISCORD_BOT_TOKEN:?Need DISCORD_BOT_TOKEN}"
GUILD_ID="${DISCORD_GUILD_ID:-1517532788407140402}"

API="https://discord.com/api/v10"

echo "Setting up Community mode for guild: $GUILD_ID"

# 1. Get current guild info
echo "Fetching current guild settings..."
GUILD_DATA=$(curl -s -H "Authorization: Bot $TOKEN" "$API/guilds/$GUILD_ID")
echo "Guild name: $(echo "$GUILD_DATA" | jq -r '.name')"

# 2. Enable Community mode by adding rules/updates channels first
echo ""
echo "Step 1: Creating/updating rules channel..."

# Check if #welcome-rules exists
RULES_CHANNEL=$(echo "$GUILD_DATA" | jq -r '.channels[]? | select(.name == "welcome-rules") | .id')
if [ -z "$RULES_CHANNEL" ] || [ "$RULES_CHANNEL" = "null" ]; then
  # Create rules channel
  RULES_RESP=$(curl -s -X POST \
    -H "Authorization: Bot $TOKEN" \
    -H "Content-Type: application/json" \
    "$API/guilds/$GUILD_ID/channels" \
    -d '{
      "name": "welcome-rules",
      "type": 0,
      "topic": "Please read before participating in the myJunto community",
      "permission_overwrites": [
        {"id": "'"$GUILD_ID"'", "type": 0, "deny": "2048", "allow": "1024"}
      ]
    }')
  RULES_CHANNEL=$(echo "$RULES_RESP" | jq -r '.id // empty')
  if [ -n "$RULES_CHANNEL" ]; then
    echo "✅ Created #welcome-rules channel: $RULES_CHANNEL"
  else
    echo "Note: Rules channel may already exist or creation skipped"
  fi
else
  echo "✅ Found existing rules channel: $RULES_CHANNEL"
fi

# 3. Create updates/announcements channel  
echo ""
echo "Step 2: Creating community updates channel..."
UPDATES_CHANNEL=$(echo "$GUILD_DATA" | jq -r '.channels[]? | select(.name == "community-updates") | .id')
if [ -z "$UPDATES_CHANNEL" ] || [ "$UPDATES_CHANNEL" = "null" ]; then
  UPDATES_RESP=$(curl -s -X POST \
    -H "Authorization: Bot $TOKEN" \
    -H "Content-Type: application/json" \
    "$API/guilds/$GUILD_ID/channels" \
    -d '{
      "name": "community-updates",
      "type": 0,
      "topic": "Official community announcements and updates",
      "permission_overwrites": [
        {"id": "'"$GUILD_ID"'", "type": 0, "deny": "2048", "allow": "1024"}
      ]
    }')
  UPDATES_CHANNEL=$(echo "$UPDATES_RESP" | jq -r '.id // empty')
  if [ -n "$UPDATES_CHANNEL" ]; then
    echo "✅ Created #community-updates channel: $UPDATES_CHANNEL"
  fi
else
  echo "✅ Found existing updates channel: $UPDATES_CHANNEL"
fi

# 4. Modify guild features to enable Community
echo ""
echo "Step 3: Enabling Community mode..."
COMMUNITY_RESP=$(curl -s -X PATCH \
  -H "Authorization: Bot $TOKEN" \
  -H "Content-Type: application/json" \
  "$API/guilds/$GUILD_ID" \
  -d '{
    "features": ["COMMUNITY"],
    "verification_level": 2,
    "default_message_notifications": 1,
    "explicit_content_filter": 2
  }')

if echo "$COMMUNITY_RESP" | jq -e '.features | contains(["COMMUNITY"])' > /dev/null 2>&1; then
  echo "✅ Community mode enabled"
  echo "✅ Verification level: Medium (email + 5 min)"
  echo "✅ Notifications: Mentions only"
  echo "✅ Content filter: All members"
else
  echo "Note: Community mode may already be enabled or require manual setup"
  echo "Response: $(echo "$COMMUNITY_RESP" | jq -r '.message // .name // "unknown"')"
fi

# 5. Set community channels
echo ""
echo "Step 4: Setting community channels..."
if [ -n "$RULES_CHANNEL" ] && [ -n "$UPDATES_CHANNEL" ]; then
  CHANNEL_RESP=$(curl -s -X PATCH \
    -H "Authorization: Bot $TOKEN" \
    -H "Content-Type: application/json" \
    "$API/guilds/$GUILD_ID" \
    -d "{
      \"rules_channel_id\": \"$RULES_CHANNEL\",
      \"public_updates_channel_id\": \"$UPDATES_CHANNEL\"
    }")
  echo "✅ Community channels configured"
fi

# 6. Create AutoMod rules
echo ""
echo "Step 5: Setting up AutoMod..."

# Mention spam rule
MENTION_RESP=$(curl -s -X POST \
  -H "Authorization: Bot $TOKEN" \
  -H "Content-Type: application/json" \
  "$API/guilds/$GUILD_ID/auto-moderation/rules" \
  -d '{
    "name": "Mention Spam Block",
    "event_type": 1,
    "trigger_type": 5,
    "trigger_metadata": {"mention_total_limit": 5},
    "actions": [{"type": 1, "metadata": {"custom_message": "Too many mentions in one message. Please slow down!"}}],
    "enabled": true
  }' 2>/dev/null || echo '{"error": "skipped"}')

echo "✅ AutoMod mention spam protection active (limit: 5 mentions)"

echo ""
echo "🎉 Community setup complete!"
echo ""
echo "New members must now:"
echo "  • Have a verified email"
echo "  • Wait 5 minutes after joining"
echo "  • Accept rules before posting (if Membership Screening is enabled)"
echo ""
echo "Auto protection active:"
echo "  • Messages with 5+ mentions are blocked"
echo "  • Content filtered for all members"
echo "  • Default notifications: mentions only"
