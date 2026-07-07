export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export async function sendEmail(message: EmailMessage): Promise<void> {
  // TODO: Replace with actual email provider (e.g. Resend, AWS SES) before Stage 12
  console.log("\n[EMAIL MOCK] -----------------------------------------");
  console.log(`[EMAIL MOCK] To:      ${message.to}`);
  console.log(`[EMAIL MOCK] Subject: ${message.subject}`);
  console.log(`[EMAIL MOCK] Body:    ${message.body}`);
  console.log("[EMAIL MOCK] -----------------------------------------\n");
}
