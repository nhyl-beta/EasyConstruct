import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

// SMTP (Gmail by default; any provider via MAIL_HOST / MAIL_PORT / MAIL_REQUIRE_TLS, e.g. Brevo on port 2525 for
// hosts such as Render that block 25/465/587). Gmail rejects a normal account password over SMTP: the account
// needs 2-Step Verification on and a 16-character App Password generated for
// it (Google Account → Security → App passwords). See apps/api/.env.example.
let transporter: Transporter | null = null;

export const assertMailConfigured = (): void => {
  if (!env.MAIL_USER || !env.MAIL_APP_PASSWORD) {
    // Never pretend to send. A silent no-op here would tell the Owner a
    // recovery email is on its way when nothing was ever mailed.
    throw new AppError(
      503,
      "MAIL_NOT_CONFIGURED",
      "Email delivery is not configured on the server. Set MAIL_USER and MAIL_APP_PASSWORD (a Gmail App Password) and restart.",
    );
  }
};

const TIMEOUT_MS = 10_000;

/** Transport settings from the environment. Exported for tests. */
export const transportOptions = () => ({
  host: env.MAIL_HOST,
  port: env.MAIL_PORT,
  // 465 = implicit TLS; anything else (587, 2525) upgrades with STARTTLS.
  secure: env.MAIL_PORT === 465,
  // MAIL_REQUIRE_TLS=true: never fall back to plaintext if the server does not offer STARTTLS.
  ...(env.MAIL_REQUIRE_TLS ? { requireTLS: true } : {}),
  // A blocked port must fail fast (MAIL_SEND_FAILED) instead of hanging the request.
  connectionTimeout: TIMEOUT_MS,
  greetingTimeout: TIMEOUT_MS,
  socketTimeout: TIMEOUT_MS,
  auth: { user: env.MAIL_USER!, pass: env.MAIL_APP_PASSWORD! },
});

/** MAIL_FROM when set. MAIL_USER is only a login (with Brevo it is not an email address), so it is the last resort. */
export const fromAddress = (): string => env.MAIL_FROM || `EasyConstruct <${env.MAIL_USER}>`;

/** Forget the cached transport (tests). */
export const resetMailer = (): void => {
  transporter = null;
};

const getTransporter = (): Transporter => {
  assertMailConfigured();
  transporter ??= nodemailer.createTransport(transportOptions());
  return transporter;
};

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  cc?: string;
  replyTo?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export const sendMail = async (message: MailMessage): Promise<void> => {
  const transport = getTransporter();
  try {
    const info = await transport.sendMail({
      from: fromAddress(),
      ...message,
    });
    // SMTP can accept the message for the Cc address and refuse the "to" address. nodemailer reports that as
    // a success with a `rejected` list, which would show a failed delivery as sent.
    const refused = ((info.rejected ?? []) as unknown[]).map((r) => String(typeof r === "string" ? r : (r as { address?: string }).address ?? "").toLowerCase());
    if (refused.includes(message.to.toLowerCase())) throw new Error(`recipient refused by the mail server: ${message.to}`);
  } catch (error) {
    console.error("[mail] send failed", error instanceof Error ? error.message : error);
    throw new AppError(
      502,
      "MAIL_SEND_FAILED",
      "The email could not be sent. Check the server's mail settings (for Gmail an App Password is required) and try again.",
    );
  }
};
