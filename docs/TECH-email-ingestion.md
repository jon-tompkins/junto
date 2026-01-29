# Email Ingestion Technical Design Document

## Overview

This document outlines the technical design for implementing email ingestion capabilities in MyJunto. The system will receive, parse, and store email newsletters to be synthesized alongside Twitter content in daily briefings.

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Email Senders │────▶│  Email Service   │────▶│   Webhook       │
│  (Newsletters)  │     │ (Resend Inbound) │     │   Handler       │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                           │
                                                           ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Daily Brief   │◀────│  Content Store   │◀────│  Content Parser │
│   Generator     │     │   (Supabase)     │     │   Service       │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Email Service Provider Selection

### Recommendation: Resend Inbound

Based on our analysis, **Resend** is the recommended email service provider for inbound processing due to:

1. **Existing Integration**: MyJunto already uses Resend for outbound emails
2. **Developer Experience**: Simple webhook-based architecture with clean API
3. **Cost Effective**: $0.50 per 1,000 emails (competitive pricing)
4. **Features**: 
   - Automatic parsing of email content and attachments
   - Webhook verification for security
   - Built-in spam filtering
   - 45-day message retention

### Implementation Details

1. **Domain Setup**
   - Use subdomain: `in.myjunto.xyz`
   - Generate unique addresses: `{userId}@in.myjunto.xyz`
   - Configure wildcard MX records: `*.in.myjunto.xyz`

2. **Webhook Configuration**
   - Endpoint: `https://api.myjunto.xyz/webhooks/email-received`
   - Event type: `email.received`
   - Implement webhook signature verification

## Data Schema

### Database Tables

```sql
-- User email addresses table
CREATE TABLE user_email_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT UNIQUE NOT NULL, -- e.g., user123@in.myjunto.xyz
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ingested emails table
CREATE TABLE ingested_emails (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address_id UUID REFERENCES user_email_addresses(id) ON DELETE CASCADE,
  
  -- Email metadata
  message_id TEXT NOT NULL,
  from_address TEXT NOT NULL,
  from_name TEXT,
  subject TEXT NOT NULL,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Parsed content
  html_content TEXT,
  text_content TEXT,
  parsed_content TEXT, -- Cleaned main content
  content_length INTEGER,
  
  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  
  -- Newsletter source detection
  source_type TEXT, -- 'substack', 'morning_brew', 'custom', etc.
  source_domain TEXT,
  
  -- User preferences
  include_in_brief BOOLEAN DEFAULT TRUE,
  priority_score INTEGER DEFAULT 0,
  
  -- Metadata
  attachment_count INTEGER DEFAULT 0,
  spam_score REAL,
  is_spam BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

-- Email attachments table
CREATE TABLE email_attachments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL, -- S3 path
  content_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User watchlist matches table
CREATE TABLE watchlist_matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE,
  term TEXT NOT NULL,
  match_count INTEGER DEFAULT 1,
  match_contexts JSONB, -- Array of matched contexts
  is_high_priority BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email processing queue (for async processing)
CREATE TABLE email_processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ingested_email_id UUID REFERENCES ingested_emails(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  processing_started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Indexes

```sql
-- Performance indexes
CREATE INDEX idx_ingested_emails_user_id ON ingested_emails(user_id);
CREATE INDEX idx_ingested_emails_received_at ON ingested_emails(received_at DESC);
CREATE INDEX idx_ingested_emails_status ON ingested_emails(status);
CREATE INDEX idx_ingested_emails_include_in_brief ON ingested_emails(include_in_brief) WHERE include_in_brief = TRUE;
CREATE INDEX idx_user_email_addresses_user_id ON user_email_addresses(user_id);
```

## API Design

### Webhook Handler

```typescript
// POST /api/webhooks/email-received
interface EmailReceivedWebhook {
  type: 'email.received';
  created_at: string;
  data: {
    email_id: string;
    created_at: string;
    from: string;
    to: string[];
    subject: string;
    html?: string;
    text?: string;
    attachments?: Array<{
      id: string;
      filename: string;
      content_type: string;
      size: number;
    }>;
  };
}

// Response
interface WebhookResponse {
  success: boolean;
  message: string;
  ingested_email_id?: string;
}
```

### Internal APIs

```typescript
// Parse email content
// POST /api/internal/parse-email
interface ParseEmailRequest {
  email_id: string;
  html_content?: string;
  text_content?: string;
}

interface ParseEmailResponse {
  parsed_content: string;
  content_length: number;
  source_type?: string;
  source_domain?: string;
}

// Get email content for synthesis
// GET /api/internal/emails/for-synthesis?user_id={userId}&date={date}
interface EmailForSynthesis {
  id: string;
  parsed_content: string;
  source_type: string;
  priority_score: number;
  received_at: string;
}
```

## Processing Pipeline

### 1. Email Reception

```typescript
// Webhook handler implementation
async function handleEmailReceived(webhook: EmailReceivedWebhook) {
  // 1. Verify webhook signature
  verifyWebhookSignature(webhook);
  
  // 2. Extract user ID from email address
  const userId = extractUserIdFromEmail(webhook.data.to[0]);
  
  // 3. Store raw email data
  const ingestedEmail = await storeIngestedEmail({
    user_id: userId,
    message_id: webhook.data.email_id,
    from_address: extractEmailAddress(webhook.data.from),
    from_name: extractDisplayName(webhook.data.from),
    subject: webhook.data.subject,
    html_content: webhook.data.html,
    text_content: webhook.data.text,
    received_at: webhook.data.created_at,
    attachment_count: webhook.data.attachments?.length || 0
  });
  
  // 4. Queue for processing
  await queueEmailForProcessing(ingestedEmail.id);
  
  return { success: true, ingested_email_id: ingestedEmail.id };
}
```

### 2. Content Parsing

```typescript
// Content parsing service
async function parseEmailContent(emailId: string) {
  const email = await getIngestedEmail(emailId);
  
  // 1. Extract main content
  const parsedContent = extractMainContent(email.html_content || email.text_content);
  
  // 2. Detect source type
  const sourceInfo = detectNewsletterSource(email.from_address, email.subject);
  
  // 3. Calculate priority score
  const priorityScore = calculatePriorityScore(parsedContent, sourceInfo);
  
  // 4. Update database
  await updateIngestedEmail(emailId, {
    parsed_content: parsedContent,
    content_length: parsedContent.length,
    source_type: sourceInfo.type,
    source_domain: sourceInfo.domain,
    priority_score: priorityScore,
    status: 'completed',
    processed_at: new Date().toISOString()
  });
  
  // 5. Process watchlist matches
  await processWatchlistMatches(emailId, parsedContent);
}

// Content extraction implementation
function extractMainContent(html: string): string {
  // 1. Convert HTML to text
  const text = convertHtmlToText(html);
  
  // 2. Remove common newsletter elements
  const cleaned = removeNewsletterElements(text);
  
  // 3. Extract main article content
  const articleContent = extractArticleContent(cleaned);
  
  return articleContent;
}
```

### 3. Watchlist Processing

```typescript
async function processWatchlistMatches(emailId: string, content: string) {
  const userId = await getUserIdFromEmail(emailId);
  const watchlistTerms = await getUserWatchlist(userId);
  
  for (const term of watchlistTerms) {
    const matches = findTermMatches(content, term.term);
    
    if (matches.length > 0) {
      await storeWatchlistMatch({
        user_id: userId,
        ingested_email_id: emailId,
        term: term.term,
        match_count: matches.length,
        match_contexts: matches.map(m => m.context),
        is_high_priority: term.is_high_priority
      });
      
      // Send alert if high priority
      if (term.is_high_priority) {
        await sendHighPriorityAlert(userId, term.term, matches);
      }
    }
  }
}
```

## Error Handling

### Retry Strategy

```typescript
// Exponential backoff retry mechanism
const retryConfig = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  factor: 2
};

async function processWithRetry(emailId: string): Promise<void> {
  const queueItem = await getQueueItem(emailId);
  
  try {
    await parseEmailContent(emailId);
    await markQueueItemCompleted(emailId);
  } catch (error) {
    if (queueItem.retry_count < queueItem.max_retries) {
      const delay = Math.min(
        retryConfig.initialDelay * Math.pow(retryConfig.factor, queueItem.retry_count),
        retryConfig.maxDelay
      );
      
      await scheduleRetry(emailId, delay);
    } else {
      await markQueueItemFailed(emailId, error.message);
      // Alert ops team
      await alertOpsTeam(`Email processing failed permanently for ${emailId}`);
    }
  }
}
```

### Error Types

1. **Parsing Errors**
   - Malformed HTML
   - Encoding issues
   - Large content size

2. **Storage Errors**
   - Database connection issues
   - Storage quota exceeded

3. **Processing Errors**
   - Watchlist processing failures
   - Content analysis errors

## Security Considerations

### Webhook Security

1. **Signature Verification**
   ```typescript
   function verifyWebhookSignature(payload: any, signature: string): boolean {
     const secret = process.env.RESEND_WEBHOOK_SECRET;
     const expectedSignature = crypto
       .createHmac('sha256', secret)
       .update(JSON.stringify(payload))
       .digest('hex');
     
     return crypto.timingSafeEqual(
       Buffer.from(signature),
       Buffer.from(expectedSignature)
     );
   }
   ```

2. **Rate Limiting**
   - Implement per-IP rate limiting
   - Use Redis for distributed rate limiting
   - Log suspicious activity

### Data Protection

1. **Encryption**
   - Encrypt email content at rest
   - Use TLS for all communications
   - Implement field-level encryption for sensitive data

2. **Access Control**
   - Implement row-level security in Supabase
   - Use service accounts with minimal permissions
   - Audit all data access

## Performance Optimization

### Caching Strategy

1. **Parsed Content Cache**
   - Cache parsed content for 1 hour
   - Use Redis for fast access
   - Invalidate on content updates

2. **User Preferences Cache**
   - Cache watchlist terms per user
   - Update cache on preference changes
   - Use cache-aside pattern

### Database Optimization

1. **Partitioning**
   - Partition ingested_emails by month
   - Archive old data to cheaper storage
   - Maintain hot/warm/cold data tiers

2. **Query Optimization**
   - Create materialized views for analytics
   - Use covering indexes for common queries
   - Implement connection pooling

## Monitoring and Observability

### Metrics to Track

1. **System Metrics**
   - Email ingestion rate
   - Processing latency
   - Error rates by type
   - Queue depth

2. **Business Metrics**
   - User adoption rate
   - Newsletter ingestion volume
   - Watchlist match rate
   - Content synthesis quality

### Logging Strategy

1. **Structured Logging**
   - Use JSON format for all logs
   - Include correlation IDs
   - Log at appropriate levels (ERROR, WARN, INFO, DEBUG)

2. **Log Aggregation**
   - Send logs to centralized system (e.g., Datadog)
   - Set up alerts for critical errors
   - Create dashboards for monitoring

## Testing Strategy

### Unit Tests

1. **Parser Tests**
   - Test various HTML formats
   - Verify content extraction accuracy
   - Test edge cases (empty content, large files)

2. **Service Tests**
   - Test webhook signature verification
   - Verify retry mechanisms
   - Test error handling

### Integration Tests

1. **End-to-End Tests**
   - Test complete email ingestion flow
   - Verify webhook handling
   - Test content synthesis integration

2. **Load Tests**
   - Simulate high email volume
   - Test system under stress
   - Verify auto-scaling behavior

## Deployment Plan

### Phase 1: Infrastructure Setup

1. Configure email domain and DNS
2. Set up webhook endpoints
3. Create database schema
4. Deploy basic ingestion pipeline

### Phase 2: Core Features

1. Implement email parsing
2. Add content storage
3. Integrate with existing synthesis pipeline
4. Add basic UI components

### Phase 3: Advanced Features

1. Implement watchlist matching
2. Add analytics and monitoring
3. Optimize performance
4. Add user management features

## Conclusion

This technical design provides a robust foundation for implementing email ingestion in MyJunto. The chosen architecture using Resend's inbound processing service offers simplicity, reliability, and scalability. The modular design allows for easy extension and maintenance as the feature evolves.