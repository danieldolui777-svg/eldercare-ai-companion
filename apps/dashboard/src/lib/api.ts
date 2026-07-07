const BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

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
  fetch(`${BASE}/memory/${id}`, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
  });

// ---- Caregivers ----
export const getCaregivers = () => req<any[]>("/caregivers");
export const createCaregiver = (data: any) =>
  req<any>("/caregivers", { method: "POST", body: JSON.stringify(data) });

// ---- Medications ----
export const getMedications = (residentId: string) =>
  req<any[]>(`/residents/${residentId}/medications`);
export const createMedication = (data: any) =>
  req<any>("/medications", { method: "POST", body: JSON.stringify(data) });

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
