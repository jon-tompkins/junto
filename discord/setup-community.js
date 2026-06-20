#!/usr/bin/env node
/**
 * Discord Community Setup Script
 * Enables Community mode, AutoMod, and verification gate
 */

const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID || '1385265226323300402';

if (!TOKEN) {
  console.error('Error: DISCORD_BOT_TOKEN not set');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

async function setupCommunity() {
  await client.login(TOKEN);
  const guild = await client.guilds.fetch(GUILD_ID);
  
  console.log(`Setting up Community mode for: ${guild.name}`);

  // 1. Enable Community mode
  try {
    await guild.edit({
      communityUpdatesChannelId: null,
      features: [...new Set([...guild.features, 'COMMUNITY'])],
    });
    console.log('✅ Community mode enabled');
  } catch (e) {
    console.log('Community mode may already be enabled:', e.message);
  }

  // 2. Set verification level to Medium (email + 5 min wait)
  try {
    await guild.setVerificationLevel(2); // 0=None, 1=Low, 2=Medium, 3=High, 4=Very High
    console.log('✅ Verification level set to Medium (email verified + 5 min)');
  } catch (e) {
    console.error('Failed to set verification level:', e.message);
  }

  // 3. Set default notifications to mentions only (anti-spam)
  try {
    await guild.setDefaultMessageNotification(1); // 0=All, 1=Mentions
    console.log('✅ Default notifications set to Mentions only');
  } catch (e) {
    console.error('Failed to set notifications:', e.message);
  }

  // 4. Enable explicit content filter for all members
  try {
    await guild.setExplicitContentFilter(2); // 0=Off, 1=No roles, 2=All
    console.log('✅ Explicit content filter enabled for all members');
  } catch (e) {
    console.error('Failed to set content filter:', e.message);
  }

  // 5. Create rules/updates channels if missing
  const channels = await guild.channels.fetch();
  
  let rulesChannel = channels.find(c => c.name === 'rules' || c.name === 'community-rules');
  let updatesChannel = channels.find(c => c.name === 'updates' || c.name === 'announcements');

  if (!rulesChannel) {
    rulesChannel = await guild.channels.create({
      name: 'rules',
      type: 0, // Text
      topic: 'Server rules and guidelines',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });
    console.log('✅ Created #rules channel');
  }

  if (!updatesChannel) {
    updatesChannel = await guild.channels.create({
      name: 'updates',
      type: 0, // Text
      topic: 'Community updates and announcements',
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionFlagsBits.SendMessages],
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
      ],
    });
    console.log('✅ Created #updates channel');
  }

  // 6. Set up Community settings (rules + updates channels)
  try {
    await guild.edit({
      rulesChannelId: rulesChannel.id,
      publicUpdatesChannelId: updatesChannel.id,
    });
    console.log('✅ Community channels configured');
  } catch (e) {
    console.error('Failed to set community channels:', e.message);
  }

  // 7. Enable Membership Screening (Rules Gate)
  // This requires REST API call - members must accept rules before posting
  try {
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guild.id}/member-verification`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: true,
          description: 'Before you can participate in the myJunto community, please read and agree to our rules.',
          form_fields: [],
        }),
      }
    );
    if (response.ok) {
      console.log('✅ Membership screening (rules gate) enabled');
    } else {
      console.log('Note: Membership screening may need manual enable in Server Settings > Safety Setup');
    }
  } catch (e) {
    console.log('Membership screening setup skipped:', e.message);
  }

  // 8. Set up AutoMod for spam/raid protection
  try {
    // Create AutoMod rule for mention spam
    const mentionSpamResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guild.id}/auto-moderation/rules`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Mention Spam Protection',
          event_type: 1, // MESSAGE_SEND
          trigger_type: 1, // KEYWORD_PRESET (we'll use mention spam)
          trigger_metadata: {
            mention_raid_protection_enabled: true,
            mention_total_limit: 5,
          },
          actions: [
            { type: 1, metadata: { channel_id: null, duration_seconds: 3600, custom_message: null } }, // BLOCK_MESSAGE
            { type: 2, metadata: { channel_id: null, duration_seconds: 3600, custom_message: null } }, // SEND_ALERT (requires channel_id)
          ],
          enabled: true,
        }),
      }
    );
    
    if (mentionSpamResponse.ok) {
      console.log('✅ AutoMod mention spam rule created');
    } else {
      const err = await mentionSpamResponse.text();
      console.log('AutoMod mention rule:', mentionSpamResponse.status, err);
    }

    // Create AutoMod rule for commonly flagged words
    const flaggedWordsResponse = await fetch(
      `https://discord.com/api/v10/guilds/${guild.id}/auto-moderation/rules`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Flagged Words Filter',
          event_type: 1,
          trigger_type: 4, // KEYWORD_PRESET
          trigger_metadata: {
            presets: [1, 2, 3], // 1=profanity, 2=sexual_content, 3=slurs
          },
          actions: [
            { type: 1, metadata: { channel_id: null, duration_seconds: null, custom_message: 'This message contains content that violates our community guidelines.' } },
          ],
          enabled: true,
        }),
      }
    );

    if (flaggedWordsResponse.ok) {
      console.log('✅ AutoMod flagged words rule created');
    } else {
      const err = await flaggedWordsResponse.text();
      console.log('AutoMod words rule:', flaggedWordsResponse.status, err);
    }

  } catch (e) {
    console.error('AutoMod setup error:', e.message);
  }

  console.log('\n🎉 Community setup complete!');
  console.log('New members will need to:');
  console.log('  1. Have a verified email');
  console.log('  2. Wait 5 minutes after joining');
  console.log('  3. Accept the rules before they can post');
  console.log('\nAutoMod is watching for:');
  console.log('  - Mention spam (5+ mentions)');
  console.log('  - Commonly flagged words');
  
  await client.destroy();
}

setupCommunity().catch(err => {
  console.error('Setup failed:', err);
  process.exit(1);
});
