import { Resend } from 'resend';

// Resend is only constructed when a key exists. In dev without a key we simply
// log the OTP to the server console so the flow is still testable.
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

// Sandbox sender — works without domain verification on Resend's free tier.
const FROM = 'ROLLCALL <onboarding@resend.dev>';

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  if (!resend) {
    // No key configured — surface the OTP in logs so testing still works.
    console.log(`[email] RESEND_API_KEY not set. OTP for ${to} is: ${otp}`);
    return;
  }

  try {
    await resend.emails.send({
      from: FROM,
      to,
      subject: 'Your ROLLCALL password reset code',
      html: `
        <div style="font-family: sans-serif; max-width: 420px; margin: 0 auto;">
          <h1 style="text-transform: uppercase; letter-spacing: -1px;">ROLLCALL</h1>
          <p>Your password reset code is:</p>
          <p style="font-size: 32px; font-weight: 800; letter-spacing: 6px; background:#FFDE59; border:3px solid #111; border-radius:12px; padding:16px; text-align:center;">${otp}</p>
          <p>This code expires in 15 minutes. If you didn't request it, ignore this email.</p>
        </div>
      `,
    });
  } catch (err) {
    // Don't leak email-send failures to the client (§6 generic response); log only.
    console.error('[email] Failed to send OTP:', err);
  }
}
