const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

// ---- Auth token (caregiver session) ----
const TOKEN_KEY = "authToken";
export function getToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(t: string) {
  try { localStorage.setItem(TOKEN_KEY, t); } catch { /* ignore */ }
  notifyAuthChanged();
}
export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  notifyAuthChanged();
}
function notifyAuthChanged() {
  try { window.dispatchEvent(new Event("auth-changed")); } catch { /* ignore */ }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    clearToken(); // session expired/invalid → AuthGate shows the login form
    throw new Error("Non authentifié");
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ---- Login / session ----
export async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error("Email ou mot de passe incorrect");
  const data = await res.json();
  setToken(data.accessToken);
  return data.caregiver as { id: string; name: string; role: string; email: string };
}
export const getMe = () => req<any>("/auth/me");

// ---- Device pairing ----
export const createDeviceToken = (residentId: string, label?: string) =>
  req<{ id: string; token: string; label?: string }>(
    `/residents/${residentId}/devices`,
    { method: "POST", body: JSON.stringify({ label }) },
  );
export const getDevices = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/devices`);
export const revokeDevice = (id: string) =>
  req<any>(`/devices/${id}/revoke`, { method: "POST", body: "{}" });

// ---- Residents ----
export const getResidents = () => req<any[]>("/residents");
export const getResident = (id: string) => req<any>(`/residents/${id}`);
export const createResident = (data: any) =>
  req<any>("/residents", { method: "POST", body: JSON.stringify(data) });
export const updateResident = (id: string, data: any) =>
  req<any>(`/residents/${id}`, { method: "PUT", body: JSON.stringify(data) });

// ---- Companion memory ----
export const getMemory = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/memory`);
export const deleteMemory = (id: string) =>
  req<void>(`/memory/${id}`, { method: "DELETE" });

// ---- Caregivers ----
export const getCaregivers = () => req<any[]>("/caregivers");
export const createCaregiver = (data: any) =>
  req<any>("/caregivers", { method: "POST", body: JSON.stringify(data) });

// ---- Medications ----
export const getMedications = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/medications`);
export const createMedication = (data: any) =>
  req<any>("/medications", { method: "POST", body: JSON.stringify(data) });

// ---- Prescription scan (returns a DRAFT to review; writes nothing) ----
export interface PrescriptionDraft {
  medications: Array<{
    name: string;
    dosage?: string;
    instructions?: string;
    times?: string[];
    prescriber?: string;
  }>;
  confidence: "high" | "medium" | "low";
  notes?: string;
}
export const scanPrescription = (data: {
  residentId?: string;
  imageBase64: string;
  mimeType: string;
  language?: "fr" | "en";
}) =>
  req<PrescriptionDraft>("/prescriptions/scan", {
    method: "POST",
    body: JSON.stringify(data),
  });

// ---- Schedules ----
export const getSchedules = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/schedules`);
export const createSchedule = (data: any) =>
  req<any>("/medication-schedules", { method: "POST", body: JSON.stringify(data) });

// ---- Reminders ----
export const getReminders = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/reminders`);
export const createReminderEvent = (data: any) =>
  req<any>("/reminder-events", { method: "POST", body: JSON.stringify(data) });
export const confirmReminder = (eventId: string, data: any) =>
  req<any>(`/reminder-events/${eventId}/confirm`, {
    method: "POST",
    body: JSON.stringify(data),
  });

// ---- Alerts ----
export const getAlerts = () => req<any[]>("/alerts");
export const getAlertsForResident = (residentId: string) =>
  req<any[]>(`/alerts/resident/${residentId}`);
export const acknowledgeAlert = (id: string) =>
  req<any>(`/alerts/${id}/acknowledge`, {
    method: "POST",
    body: JSON.stringify({ caregiverId: "dashboard-user" }),
  });
export const resolveAlert = (id: string) =>
  req<any>(`/alerts/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ caregiverId: "dashboard-user" }),
  });

// ---- Scheduler ----
export const generateReminders = () =>
  req<any>("/scheduler/generate", { method: "POST", body: "{}" });
export const detectMissed = () =>
  req<any>("/scheduler/detect-missed", { method: "POST", body: "{}" });

// ---- Voice companion ----
export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface ConverseResponse {
  transcript: string;
  reply: string;
  audioBase64: string;
  audioMimeType: string;
}
export const converse = (data: {
  residentId: string;
  audioBase64: string;
  mimeType: string;
  language?: "fr" | "en";
  history?: ChatTurn[];
}) =>
  req<ConverseResponse>("/voice/converse", {
    method: "POST",
    body: JSON.stringify(data),
  });
