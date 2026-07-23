/**
 * Provider-agnostic SMS notification. Mirrors the web-search abstraction:
 * an interface, one concrete backend (Twilio), and a factory that returns
 * `undefined` when nothing is configured — so the whole feature stays inert
 * until the host sets the env vars. Swap the backend without touching callers.
 */

export interface SmsMessage {
  /** Destination phone in E.164 (e.g. +33612345678). */
  to: string;
  /** Plain-text body. Keep it short and free of sensitive detail. */
  body: string;
}

export interface SmsResult {
  ok: boolean;
  /** Provider-side message id when the send was accepted. */
  id?: string;
  /** Human-readable failure reason when ok is false. */
  error?: string;
}

/** A pluggable SMS backend. */
export interface NotificationProvider {
  readonly name: string;
  sendSms(msg: SmsMessage): Promise<SmsResult>;
}

/**
 * Twilio SMS over the REST API. Uses fetch + Basic auth so we pull in no SDK
 * dependency (same choice as TavilyWebSearch). Never throws: a failed send is
 * returned as { ok: false } so the caller can log it and move on — an alert
 * must still be recorded even if the SMS could not go out.
 */
export class TwilioSmsProvider implements NotificationProvider {
  readonly name = "twilio";
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    /** The Twilio-verified sender number, E.164. */
    private readonly from: string,
  ) {}

  async sendSms(msg: SmsMessage): Promise<SmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      "base64",
    );
    const form = new URLSearchParams({
      To: msg.to,
      From: this.from,
      Body: msg.body,
    });
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      });
      if (!res.ok) {
        let detail = `Twilio ${res.status}`;
        try {
          const body: any = await res.json();
          if (body?.message) detail = `Twilio ${res.status}: ${body.message}`;
        } catch {
          /* keep the status-only detail */
        }
        return { ok: false, error: detail };
      }
      const data: any = await res.json();
      return { ok: true, id: data?.sid };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? "network error" };
    }
  }
}

/**
 * Build the configured SMS provider, or `undefined` when it is not set up.
 * `undefined` is the intended state until the operator adds the Twilio env vars
 * — callers treat it as "no channel available" and simply skip sending.
 */
export function createNotificationProvider(config: {
  provider?: string; // "twilio" | "none"
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioFromNumber?: string;
}): NotificationProvider | undefined {
  const p = (config.provider ?? "twilio").toLowerCase();
  if (p === "none") return undefined;
  // default: twilio — only when all three credentials are present.
  if (config.twilioAccountSid && config.twilioAuthToken && config.twilioFromNumber) {
    return new TwilioSmsProvider(
      config.twilioAccountSid,
      config.twilioAuthToken,
      config.twilioFromNumber,
    );
  }
  return undefined;
}
