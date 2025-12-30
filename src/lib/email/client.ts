import { Resend } from 'resend';
import { config, validateConfig } from '@/lib/utils/config';

let resendInstance: Resend | null = null;

export function getResend(): Resend {
  if (!resendInstance) {
    validateConfig('resend');
    resendInstance = new Resend(config.resend.apiKey);
  }
  
  return resendInstance;
}
