import * as admin from 'firebase-admin';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as nodemailer from 'nodemailer';

const COOLDOWN_SECONDS = 60;
const CODE_EXPIRY_MINUTES = 10;

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getTransporter() {
  const host = process.env.EMAIL_SMTP_HOST;
  const port = parseInt(process.env.EMAIL_SMTP_PORT || '587', 10);
  const user = process.env.EMAIL_SMTP_USER;
  const pass = process.env.EMAIL_SMTP_PASS;

  if (!host || !user || !pass) {
    throw new HttpsError(
      'failed-precondition',
      'Email service not configured. Set EMAIL_SMTP_HOST, EMAIL_SMTP_USER, EMAIL_SMTP_PASS environment variables.'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendVerificationCodeHandler(
  request: CallableRequest
): Promise<{ success: boolean; message: string }> {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in');
  }

  const uid = request.auth.uid;
  const userRecord = await admin.auth().getUser(uid);

  if (userRecord.emailVerified) {
    return { success: true, message: 'Email already verified' };
  }

  const email = userRecord.email;
  if (!email) {
    throw new HttpsError('failed-precondition', 'No email on account');
  }

  const db = admin.firestore();
  const codeRef = db.collection('verificationCodes').doc(uid);
  const existing = await codeRef.get();

  // Rate limiting: enforce cooldown between sends
  if (existing.exists) {
    const data = existing.data()!;
    const lastSent = data.createdAt?.toDate?.() ?? new Date(0);
    const elapsed = (Date.now() - lastSent.getTime()) / 1000;
    if (elapsed < COOLDOWN_SECONDS) {
      const wait = Math.ceil(COOLDOWN_SECONDS - elapsed);
      throw new HttpsError(
        'resource-exhausted',
        `Please wait ${wait} seconds before requesting a new code`
      );
    }
  }

  const code = generateCode();
  const now = admin.firestore.Timestamp.now();
  const expiresAt = admin.firestore.Timestamp.fromDate(
    new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000)
  );

  await codeRef.set({
    code,
    email,
    uid,
    attempts: 0,
    createdAt: now,
    expiresAt,
  });

  const transporter = getTransporter();
  const fromName = process.env.EMAIL_FROM_NAME || 'NYU Buddy';
  const fromAddr = process.env.EMAIL_SMTP_USER!;

  await transporter.sendMail({
    from: `"${fromName}" <${fromAddr}>`,
    to: email,
    subject: `${code} is your NYU Buddy verification code`,
    text: [
      `Hi there!\n`,
      `Your verification code for NYU Buddy is:\n`,
      `    ${code}\n`,
      `This code expires in ${CODE_EXPIRY_MINUTES} minutes.\n`,
      `If you didn't request this, you can safely ignore this email.`,
    ].join('\n'),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <h2 style="color: #7c3aed; margin: 0 0 8px;">NYU Buddy</h2>
        <p style="color: #374151; font-size: 15px; margin: 0 0 24px;">Enter this code to verify your email address:</p>
        <div style="background: #f5f3ff; border: 2px solid #7c3aed; border-radius: 12px; padding: 20px; text-align: center; margin: 0 0 24px;">
          <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #7c3aed;">${code}</span>
        </div>
        <p style="color: #6b7280; font-size: 13px; margin: 0;">This code expires in ${CODE_EXPIRY_MINUTES} minutes. If you didn't sign up for NYU Buddy, ignore this email.</p>
      </div>
    `,
  });

  return { success: true, message: 'Verification code sent' };
}
