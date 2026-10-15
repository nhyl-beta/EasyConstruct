import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";

// Gmail SMTP. Gmail rejects a normal account password over SMTP: the account
// needs 2-Step Verification on and a 16-character App Password generated for
// it (Google Account → Security → App passwords). See server/.env.example.
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

const getTransporter = (): Transporter => {
  assertMailConfigured();
  transporter ??= nodemailer.createTransport({
    host: env.MAIL_HOST,
    port: env.MAIL_PORT,
    // 465 = implicit TLS; anything else (587) upgrades with STARTTLS.
    secure: env.MAIL_PORT === 465,
    auth: { user: env.MAIL_USER!, pass: env.MAIL_APP_PASSWORD! },
  });
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
    await transport.sendMail({
      from: env.MAIL_FROM ?? `EasyConstruct <${env.MAIL_USER}>`,
      ...message,
    });
  } catch (error) {
    console.error("[mail] send failed", error instanceof Error ? error.message : error);
    throw new AppError(
      502,
      "MAIL_SEND_FAILED",
      "The email could not be sent. Check the server's Gmail credentials (an App Password is required) and try again.",
    );
  }
};
