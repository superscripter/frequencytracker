import { Resend } from 'resend';

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is not set');
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const resend = getResend();

    const { error } = await resend.emails.send({
      from: 'Frequency Tracker <support@frequencytracker.com>',
      to,
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[Email] Failed to send:', error);
      return { success: false, error: error.message };
    }

    console.log('[Email] Sent successfully to:', to);
    return { success: true };
  } catch (err) {
    console.error('[Email] Error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

// Convenience function for support emails
export async function sendSupportNotification({
  userEmail,
  userName,
  message,
}: {
  userEmail: string;
  userName?: string;
  message: string;
}): Promise<{ success: boolean; error?: string }> {
  return sendEmail({
    to: 'support@frequencytracker.com',
    subject: `Support Request from ${userName || userEmail}`,
    html: `
      <h2>New Support Request</h2>
      <p><strong>From:</strong> ${userName || 'Unknown'} (${userEmail})</p>
      <hr />
      <p>${message.replace(/\n/g, '<br />')}</p>
    `,
    text: `New Support Request\n\nFrom: ${userName || 'Unknown'} (${userEmail})\n\n${message}`,
  });
}
