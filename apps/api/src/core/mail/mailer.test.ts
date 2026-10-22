import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { fromAddress, resetMailer, sendMail } from "./mailer.js";

type MailEnv = { MAIL_HOST: string; MAIL_PORT: number; MAIL_REQUIRE_TLS: boolean; MAIL_USER?: string; MAIL_APP_PASSWORD?: string; MAIL_FROM?: string };
const mail = env as unknown as MailEnv;
const original = { ...mail };

afterEach(() => {
  Object.assign(mail, original);
  resetMailer();
});

const captureTransport = (t: { mock: { method: (...a: never[]) => unknown } }) => {
  const created: Record<string, unknown>[] = [];
  const sent: Record<string, unknown>[] = [];
  (t.mock.method as (o: object, m: string, i: unknown) => unknown)(nodemailer, "createTransport", (opts: Record<string, unknown>) => {
    created.push(opts);
    return { sendMail: async (m: Record<string, unknown>) => (sent.push(m), { rejected: [] }) };
  });
  return { created, sent };
};
const msg = { to: "a@example.com", subject: "s", text: "t" };

test("Gmail defaults are unchanged: smtp.gmail.com:465, secure, no requireTLS", async (t) => {
  Object.assign(mail, { MAIL_HOST: "smtp.gmail.com", MAIL_PORT: 465, MAIL_REQUIRE_TLS: false, MAIL_USER: "me@gmail.com", MAIL_APP_PASSWORD: "pw", MAIL_FROM: undefined });
  const { created, sent } = captureTransport(t as never);
  await sendMail(msg);
  assert.equal(created[0]!.host, "smtp.gmail.com");
  assert.equal(created[0]!.port, 465);
  assert.equal(created[0]!.secure, true);
  assert.equal("requireTLS" in created[0]!, false);
  assert.equal(sent[0]!.from, "EasyConstruct <me@gmail.com>");
});

test("port 2525 with MAIL_REQUIRE_TLS=true uses STARTTLS only, with short timeouts", async (t) => {
  Object.assign(mail, { MAIL_HOST: "smtp-relay.brevo.com", MAIL_PORT: 2525, MAIL_REQUIRE_TLS: true, MAIL_USER: "login", MAIL_APP_PASSWORD: "key" });
  const { created } = captureTransport(t as never);
  await sendMail(msg);
  assert.equal(created[0]!.secure, false);
  assert.equal(created[0]!.requireTLS, true);
  for (const k of ["connectionTimeout", "greetingTimeout", "socketTimeout"]) assert.equal(created[0]![k], 10_000);
});

test("From comes from MAIL_FROM, never from the SMTP login", async (t) => {
  Object.assign(mail, { MAIL_USER: "login-not-an-email", MAIL_APP_PASSWORD: "key", MAIL_FROM: "EasyConstruct <noreply@example.com>" });
  const { sent } = captureTransport(t as never);
  assert.equal(fromAddress(), "EasyConstruct <noreply@example.com>");
  await sendMail(msg);
  assert.equal(sent[0]!.from, "EasyConstruct <noreply@example.com>");
});

test("a transport failure surfaces as MAIL_SEND_FAILED", async (t) => {
  Object.assign(mail, { MAIL_USER: "u", MAIL_APP_PASSWORD: "p" });
  (t.mock.method as unknown as (o: object, m: string, i: unknown) => unknown)(nodemailer, "createTransport", () => ({
    sendMail: async () => {
      throw new Error("Connection timeout");
    },
  }));
  t.mock.method(console, "error", () => undefined);
  await assert.rejects(() => sendMail(msg), (e: { code?: string }) => e.code === "MAIL_SEND_FAILED");
});
