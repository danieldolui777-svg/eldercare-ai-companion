const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

// ── Two modes ───────────────────────────────────────────────────────────────
//  - Paired (secure): a device token binds this device to ONE resident.
//  - Open (prototype): no token; the resident is chosen here and sent in the body.
//    Works only while the API runs in open mode (AUTH_DISABLED default).
const DEVICE_TOKEN_KEY = "deviceToken";
const OPEN_RID_KEY = "openResidentId";

export function getDeviceToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}
export function setDeviceToken(t: string) {
  try { localStorage.setItem(DEVICE_TOKEN_KEY, t.trim()); } catch { /* ignore */ }
}
export function clearDeviceToken() {
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
}
export function getOpenResidentId(): string | null {
  try { return localStorage.getItem(OPEN_RID_KEY); } catch { return null; }
}
export function setOpenResidentId(id: string) {
  try { localStorage.setItem(OPEN_RID_KEY, id); } catch { /* ignore */ }
}

function deviceHeaders(): Record<string, string> {
  const t = getDeviceToken();
  return t ? { "X-Device-Token": t } : {};
}
/** In open mode (no token) inject the chosen residentId into the request body. */
function withResident<T extends object>(obj: T): T & { residentId?: string } {
  if (!getDeviceToken()) {
    const rid = getOpenResidentId();
    if (rid) return { ...obj, residentId: rid };
  }
  return obj;
}

async function devReq<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...deviceHeaders(),
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

/** The resident this device is acting for. */
export interface DeviceResident {
  id: string;
  firstName: string;
  preferredName?: string;
  language?: "fr" | "en";
}

/** All residents — only reachable in open mode (used to pick who to talk to). */
export const getResidents = () => devReq<DeviceResident[]>("/residents");

/** Resolve the current resident: from the device token (paired) or the picker (open). */
export async function getBoundResident(): Promise<DeviceResident | null> {
  if (getDeviceToken()) return devReq<DeviceResident>("/device/me");
  const list = await getResidents();
  if (list.length === 0) return null;
  const rid = getOpenResidentId();
  const chosen = list.find((r) => r.id === rid) ?? list[0];
  setOpenResidentId(chosen.id);
  return chosen;
}
// Back-compat alias.
export const getDeviceMe = getBoundResident;

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

export const chat = (data: {
  text: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}) => devReq<ConverseResponse>("/voice/chat", {
  method: "POST",
  body: JSON.stringify(withResident(data)),
});

export const converse = (data: {
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}) => devReq<ConverseResponse>("/voice/converse", {
  method: "POST",
  body: JSON.stringify(withResident(data)),
});

export interface DueReminder {
  id: string;
  medicationName: string;
  scheduledAt: string;
}

export async function getDueReminders(): Promise<DueReminder[]> {
  const path = getDeviceToken()
    ? "/device/reminders"
    : `/residents/${getOpenResidentId()}/reminders`;
  const all = await devReq<any[]>(path);
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
    body: JSON.stringify(withResident({})),
  });

export const markReminderMissed = (reminderId: string) =>
  devReq<void>(`/device/reminders/${reminderId}/missed`, {
    method: "POST",
    body: "{}",
  });

export const announce = (reminderId: string) =>
  devReq<AnnounceResponse>("/voice/announce", {
    method: "POST",
    body: JSON.stringify(withResident({ reminderId })),
  });
