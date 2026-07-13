const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

// ── Device token (pairing) ─────────────────────────────────────────────────────
// The device is bound to ONE resident via a token generated on the dashboard.
const DEVICE_TOKEN_KEY = "deviceToken";
export function getDeviceToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}
export function setDeviceToken(t: string) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, t.trim()); } catch { /* ignore */ }
}
export function clearDeviceToken() {
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
}

async function devReq<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getDeviceToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "X-Device-Token": token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** The resident this device is bound to. */
export interface DeviceResident {
  id: string;
  firstName: string;
  preferredName?: string;
  language?: "fr" | "en";
}
export const getDeviceMe = () => devReq<DeviceResident>("/device/me");

export interface ConverseResponse {
  transcript: string;
  reply: string;
  audioBase64: string;
  audioMimeType: string;
  confirmation?: {
    medicationName: string;
    status: "confirmed_taken" | "confirmed_not_taken" | "unknown";
  };
}

/** Text-based turn — resident is derived from the device token, not sent. */
export const chat = (data: {
  text: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}) => devReq<ConverseResponse>("/voice/chat", {
  method: "POST",
  body: JSON.stringify(data),
});

export const converse = (data: {
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}) => devReq<ConverseResponse>("/voice/converse", {
  method: "POST",
  body: JSON.stringify(data),
});

export interface DueReminder {
  id: string;
  medicationName: string;
  scheduledAt: string;
}

/** Reminders due now for this device's resident. */
export async function getDueReminders(): Promise<DueReminder[]> {
  const all = await devReq<any[]>("/device/reminders");
  const now = Date.now();
  return all
    .filter(
      (r) => r.status === "scheduled" && new Date(r.scheduledAt).getTime() <= now,
    )
    .map((r) => ({
      id: r.id,
      medicationName: r.medicationSchedule?.medication?.name ?? "médicament",
      scheduledAt: r.scheduledAt,
    }));
}

export interface AnnounceResponse {
  text: string;
  audioBase64: string;
  audioMimeType: string;
  medicationName: string;
}

export const createTestReminder = () =>
  devReq<{ reminderId: string }>("/voice/test-reminder", {
    method: "POST",
    body: "{}",
  });

/** Marks a reminder as missed (no response) for this device's resident. */
export const markReminderMissed = (reminderId: string) =>
  devReq<void>(`/device/reminders/${reminderId}/missed`, {
    method: "POST",
    body: "{}",
  });

export const announce = (reminderId: string) =>
  devReq<AnnounceResponse>("/voice/announce", {
    method: "POST",
    body: JSON.stringify({ reminderId }),
  });
