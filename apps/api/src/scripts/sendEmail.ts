import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env from project root (works from any directory)
config({ path: resolve(process.cwd(), '.env') });
// Also try apps/api/.env and root .env
config({ path: resolve(process.cwd(), 'apps/api/.env') });
config({ path: resolve(process.cwd(), '../../.env') });

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Get command line arguments
const args = process.argv.slice(2);
const to = args[0];
const subject = args[1];
const message = args.slice(2).join(' ');

if (!to || !subject || !message) {
  console.log('Usage: npx tsx src/scripts/sendEmail.ts <to> <subject> <message>');
  console.log('');
  console.log('Example:');
  console.log('  npx tsx src/scripts/sendEmail.ts user@example.com "Re: Your Question" "Thanks for reaching out! Here is the answer..."');
  process.exit(1);
}

async function send() {
  console.log('Sending email...');
  console.log('  To:', to);
  console.log('  Subject:', subject);
  console.log('  Message:', message);
  console.log('');

  try {
    const { data, error } = await resend.emails.send({
      from: 'Frequency Tracker Support <support@frequencytracker.com>',
      to: [to],
      subject: subject,
      html: `<p>${message.replace(/\n/g, '<br/>')}</p>`,
      text: message,
    });

    if (error) {
      console.error('Error:', error);
      process.exit(1);
    }

    console.log('Email sent successfully!');
    console.log('Email ID:', data?.id);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

send();
