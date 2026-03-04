#!/usr/bin/env python3
"""
agentmail-setup.py - Set up AgentMail inbox for MyJunto newsletter ingestion

Usage:
    export AGENTMAIL_API_KEY="am_..."
    python3 agentmail-setup.py
"""

import os
from agentmail import AgentMail

WEBHOOK_URL = "https://myjunto.xyz/api/webhooks/agentmail"

def main():
    api_key = os.environ.get("AGENTMAIL_API_KEY")
    if not api_key:
        print("Error: AGENTMAIL_API_KEY not set")
        print("Get your key from https://console.agentmail.to/")
        return
    
    client = AgentMail(api_key=api_key)
    
    # Create inbox for newsletters
    print("Creating inbox...")
    inbox = client.inboxes.create(
        username="newsletters",  # will be newsletters@...agentmail.to
    )
    print(f"✅ Inbox created: {inbox.email}")
    print(f"   Inbox ID: {inbox.inbox_id}")
    
    # Set up webhook for incoming messages
    print("\nCreating webhook...")
    webhook = client.webhooks.create(
        url=WEBHOOK_URL,
        events=["message.received"],
    )
    print(f"✅ Webhook created: {webhook.webhook_id}")
    print(f"   URL: {WEBHOOK_URL}")
    
    print("\n" + "="*50)
    print("SETUP COMPLETE!")
    print("="*50)
    print(f"\n📧 Newsletter inbox: {inbox.email}")
    print(f"\nNext steps:")
    print(f"1. Subscribe this email to newsletters")
    print(f"2. Or forward jai.jon.tomp@gmail.com → {inbox.email}")
    print(f"\nEmails will be stored in MyJunto automatically.")

if __name__ == "__main__":
    main()
