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
