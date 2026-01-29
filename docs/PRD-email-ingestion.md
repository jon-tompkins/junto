# Email Forwarding/Ingestion - Product Requirements Document

## Overview

MyJunto currently synthesizes tweets from curated Twitter profiles into daily briefings. This document outlines the requirements for adding email ingestion capabilities, allowing users to forward newsletters from various sources to be synthesized alongside their Twitter content.

## Objective

Enable users to forward email newsletters (Substack, Morning Brew, etc.) to unique email addresses, parse the content, and incorporate it into their AI-generated daily briefings alongside Twitter content.

## User Stories

### Primary User Stories

1. **Email Address Generation**
   - As a user, I want to receive a unique email address (e.g., user123@in.myjunto.xyz) so that I can forward newsletters to it
   - The address should be automatically generated and associated with my account

2. **Newsletter Forwarding**
   - As a user, I want to forward any newsletter email to my unique address
   - The system should accept emails from any sender (no whitelist required)
   - Multiple newsletters should be supported per user

3. **Content Parsing**
   - As a user, I want the system to intelligently extract the main content from forwarded newsletters
   - The parser should handle various email formats (HTML, plain text, multipart)
   - Email headers, footers, and unsubscribe links should be filtered out

4. **AI Synthesis Integration**
   - As a user, I want the parsed newsletter content to be synthesized with my Twitter feeds
   - The AI should create a unified briefing that includes both Twitter and newsletter content
   - Content should be weighted based on my preferences and engagement

5. **Content Management**
   - As a user, I want to view a history of ingested newsletters
   - I should be able to delete newsletters I no longer want included
   - I should be able to mark certain newsletters as high priority

6. **Watchlist Integration**
   - As a user, I want my defined key terms to be highlighted in newsletter content
   - I should receive alerts when high-priority terms appear in newsletters

## Functional Requirements

### Email Infrastructure

1. **Unique Email Addresses**
   - Each user receives a unique subdomain: `{userId}@in.myjunto.xyz`
   - Addresses are automatically generated on account creation
   - Addresses cannot be changed or customized by users

2. **Email Reception**
   - Accept emails up to 25MB in size
   - Support HTML, plain text, and multipart MIME formats
   - Handle multiple attachments (store for future use)
   - Automatic spam filtering with quarantine capability

3. **Content Extraction**
   - Extract main content body from HTML emails
   - Remove tracking pixels and unnecessary elements
   - Strip email headers, footers, and unsubscribe links
   - Preserve article structure and formatting
   - Extract metadata: sender, subject, sent date

4. **Storage**
   - Store parsed content in Supabase
   - Maintain original email for 30 days
   - Store attachments separately with metadata
   - Track ingestion metadata (received time, parsing time)

### AI Processing

1. **Content Preprocessing**
   - Clean and normalize text content
   - Identify newsletter source (Substack, Morning Brew, etc.)
   - Extract key topics and entities
   - Score content relevance based on user preferences

2. **Synthesis Integration**
   - Include newsletter content in daily briefing generation
   - Apply user-specific weighting to newsletter vs Twitter content
   - Maintain content provenance (source tracking)
   - Generate unified summary across all sources

3. **Watchlist Processing**
   - Scan newsletter content for user-defined terms
   - Apply term highlighting in final output
   - Trigger alerts for high-priority matches
   - Track term frequency across sources

### User Interface

1. **Email Settings Page**
   - Display user's unique email address prominently
   - Show instructions for forwarding newsletters
   - Display recent ingested emails
   - Provide delete/archive functionality

2. **Newsletter Management**
   - List view of all ingested newsletters
   - Search and filter capabilities
   - Preview of parsed content
   - Toggle inclusion in daily briefings

3. **Analytics**
   - Show ingestion statistics
   - Display source breakdown (Twitter vs newsletters)
   - Show most active newsletter sources
   - Track engagement with newsletter content

## Non-Functional Requirements

### Performance

1. **Email Processing**
   - Parse and store emails within 30 seconds of receipt
   - Handle 1000+ emails per hour during peak times
   - Process attachments up to 25MB efficiently

2. **System Scalability**
   - Support 10,000+ active users
   - Store 100,000+ newsletters per month
   - Scale horizontally as user base grows

### Security

1. **Email Security**
   - Implement SPF, DKIM, and DMARC validation
   - Scan for malicious attachments
   - Rate limiting to prevent abuse
   - Secure webhook endpoints

2. **Data Protection**
   - Encrypt stored email content
   - Implement proper access controls
   - Comply with data retention policies
   - Allow users to export/delete their data

### Reliability

1. **Uptime Requirements**
   - 99.9% uptime for email ingestion
   - Graceful handling of parsing failures
   - Retry mechanism for failed processing
   - Dead letter queue for problematic emails

## Success Metrics

1. **Adoption Metrics**
   - Percentage of users forwarding newsletters
   - Number of newsletters forwarded per active user
   - Growth rate of email ingestion volume

2. **Engagement Metrics**
   - Time spent reading synthesized content
   - Click-through rates on newsletter content
   - User retention rate for email feature

3. **Quality Metrics**
   - Parsing accuracy rate (>95% target)
   - User satisfaction with content synthesis
   - Reduction in email overload complaints

## Future Considerations

1. **Advanced Features**
   - RSS feed ingestion as additional source
   - AI-powered newsletter recommendations
   - Automatic categorization of newsletters
   - Newsletter subscription management

2. **Integration Expansion**
   - Support for more content sources
   - Integration with productivity tools
   - API for third-party integrations
   - White-label solutions

## Conclusion

This email ingestion feature will transform MyJunto from a Twitter-only synthesis tool into a comprehensive content curation platform. By allowing users to consolidate newsletters alongside their Twitter feeds, we create a more valuable "second brain" that reduces information overload while keeping users informed.

The implementation should prioritize user experience, with simple forwarding mechanics and intelligent content processing that requires minimal user configuration. Success will be measured by adoption rates and user engagement with the synthesized content.