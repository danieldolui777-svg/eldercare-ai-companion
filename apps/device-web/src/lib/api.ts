const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Resident {
  id: string;
  firstName: string;
  preferredName?: string;
  language?: "fr" | "en";
}

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

export async function getResidents(): Promise<Resident[]> {
  const res = await fetch(`${BASE}/residents`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<Resident[]>;
}

/** Text-based turn — client already has the transcript (Web Speech API wake-word flow). */
export async function chat(data: {
  residentId: string;
  text: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}): Promise<ConverseResponse> {
  const res = await fetch(`${BASE}/voice/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<ConverseResponse>;
}

export async function converse(data: {
  residentId: string;
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}): Promise<ConverseResponse> {
  const res = await fetch(`${BASE}/voice/converse`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}`);
  }
  return res.json() as Promise<ConverseResponse>;
}

export interface DueReminder {
  id: string;
  medicationName: string;
  scheduledAt: string;
}

/** Reminders that are due now and not yet announced (status "scheduled"). */
export async function getDueReminders(residentId: string): Promise<DueReminder[]> {
  const res = await fetch(`${BASE}/residents/${residentId}/reminders`);
  if (!res.ok) throw new Error(`API ${res.status}`);
  const all = (await res.json()) as any[];
  const now = Date.now();
  return all
    .filter(
      (r) =>
        r.status === "scheduled" && new Date(r.scheduledAt).getTime() <= now,
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

export async function announce(
  residentId: string,
  reminderId: string,
): Promise<AnnounceResponse> {
  const res = await fetch(`${BASE}/voice/announce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ residentId, reminderId }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<AnnounceResponse>;
}
