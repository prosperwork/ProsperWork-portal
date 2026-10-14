import type { Transporter } from "nodemailer";
export interface EmailJob {
  id: string;
  lease_id: string;
  email: string;
  category: string;
  subject: string;
  template: string;
  payload: Record<string, unknown>;
}
export const senderAliases: Readonly<Record<string, string>>;
export const replyToAliases: Readonly<Record<string, string>>;
export function smtpTransport(): Transporter;
export function safeEmailError(error: unknown): string;
export function emailText(job: EmailJob, appUrl: string): string;
export function deliverEmail(job: EmailJob, appUrl: string): Promise<void>;
