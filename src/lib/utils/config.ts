// Environment configuration with validation

function getEnvVar(name: string, required = true): string {
  const value = process.env[name];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value || '';
}

export const config = {
  // Supabase
  supabase: {
    url: getEnvVar('SUPABASE_URL', false),
    anonKey: getEnvVar('SUPABASE_ANON_KEY', false),
    serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY', false),
  },
  
  // Anthropic
  anthropic: {
    apiKey: getEnvVar('ANTHROPIC_API_KEY', false),
  },
  
  // Twitter data
  apify: {
    apiKey: getEnvVar('APIFY_API_KEY', false),
  },
  
  // Resend
  resend: {
    apiKey: getEnvVar('RESEND_API_KEY', false),
    fromEmail: getEnvVar('RESEND_FROM_EMAIL', false) || 'onboarding@resend.dev',
  },
  
  // App
  app: {
    newsletterRecipient: getEnvVar('NEWSLETTER_RECIPIENT', false),
    cronSecret: getEnvVar('CRON_SECRET', false),
  },
} as const;

// Validation helper for specific features
export function validateConfig(feature: 'supabase' | 'anthropic' | 'apify' | 'resend') {
  switch (feature) {
    case 'supabase':
      if (!config.supabase.url || !config.supabase.serviceRoleKey) {
        throw new Error('Supabase configuration missing. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
      }
      break;
    case 'anthropic':
      if (!config.anthropic.apiKey) {
        throw new Error('Anthropic API key missing. Set ANTHROPIC_API_KEY');
      }
      break;
    case 'apify':
      if (!config.apify.apiKey) {
        throw new Error('Apify API key missing. Set APIFY_API_KEY');
      }
      break;
    case 'resend':
      if (!config.resend.apiKey) {
        throw new Error('Resend API key missing. Set RESEND_API_KEY');
      }
      break;
  }
}
