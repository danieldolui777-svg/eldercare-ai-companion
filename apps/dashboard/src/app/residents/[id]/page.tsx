"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getResident, getMedications, getSchedules, getReminders, getAlertsForResident,
  createMedication, createSchedule, createReminderEvent, confirmReminder,
} from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { FormField, inputCls } from "@/components/FormField";

export default function ResidentPage() {
  const { id } = useParams<{ id: string }>();
  const [resident, setResident] = useState<any>(null);
  const [meds, setMeds] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [tab, setTab] = useState<"reminders" | "medications" | "alerts">("reminders");

  const [showMedForm, setShowMedForm] = useState(false);
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [r, m, s, rem, al] = await Promise.all([
      getResident(id),
      getMedications(id),
      getSchedules(id),
      getReminders(id),
      getAlertsForResident(id),
    ]);
    setResident(r);
    setMeds(Array.isArray(m) ? m : []);
    setSchedules(Array.isArray(s) ? s : []);
    setReminders(Array.isArray(rem) ? rem : []);
    setAlerts(Array.isArray(al) ? al : []);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ---- Create medication ----
  const [medForm, setMedForm] = useState({ name: "", dosageLabel: "", instructionsLabel: "", prescribingSourceLabel: "" });
  async function submitMed(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await createMedication({ ...medForm, residentId: id, active: true });
      setShowMedForm(false);
      setMedForm({ name: "", dosageLabel: "", instructionsLabel: "", prescribingSourceLabel: "" });
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  // ---- Create schedule ----
  const [schedForm, setSchedForm] = useState({ medicationId: "", timeOfDay: "08:00", startDate: new Date().toISOString().slice(0, 10) });
  async function submitSched(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await createSchedule({ ...schedForm, residentId: id, recurrenceRule: "FREQ=DAILY", active: true });
      setShowSchedForm(false);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  // ---- Create reminder event manually ----
  async function createNowEvent(scheduleId: string) {
    setSaving(true);
    try {
      await createReminderEvent({ medicationScheduleId: scheduleId, scheduledAt: new Date().toISOString() });
      await load();
    } finally { setSaving(false); }
  }

  // ---- Confirm reminder ----
  const [confirmStatus, setConfirmStatus] = useState("confirmed_taken");
  async function submitConfirm(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await confirmReminder(showConfirmForm.id, { status: confirmStatus, confirmationSource: "dashboard" });
      setShowConfirmForm(null);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  if (!resident) return <div className="text-gray-400 text-sm">Chargement...</div>;

  return (
    <div>
      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{resident.firstName}</h1>
            {resident.preferredName && <p className="text-gray-500 text-sm">{resident.preferredName}</p>}
            <p className="text-xs text-gray-400 mt-1">
              Né(e) le {new Date(resident.dateOfBirth).toLocaleDateString("fr-FR")} · Langue : {resident.language}
            </p>
          </div>
          <Badge value={resident.consentStatus} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["reminders", "medications", "alerts"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "reminders" ? "Rappels" : t === "medications" ? "Medicaments" : "Alertes"}
            {t === "alerts" && alerts.filter((a) => a.status === "created" || a.status === "sent").length > 0 && (
              <span className="ml-1 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {alerts.filter((a) => a.status === "created" || a.status === "sent").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Reminders tab */}
      {tab === "reminders" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">{reminders.length} rappel(s)</p>
            {schedules.length > 0 && (
              <button
                onClick={() => createNowEvent(schedules[0].id)}
                disabled={saving}
                className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                + Tester un rappel maintenant
              </button>
            )}
          </div>
          {reminders.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun rappel. Generez-les depuis la page Alertes.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {reminders.map((r) => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge value={r.status} />
                      <span className="text-sm text-gray-700">{r.medicationSchedule?.medication?.name ?? "—"}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(r.scheduledAt).toLocaleString("fr-FR")}
                    </p>
                  </div>
                  {(r.status === "scheduled" || r.status === "delivered") && (
                    <button
                      onClick={() => { setConfirmStatus("confirmed_taken"); setShowConfirmForm(r); setError(""); }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
                    >
                      Confirmer
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Medications tab */}
      {tab === "medications" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">{meds.length} medicament(s)</p>
            <div className="flex gap-2">
              {meds.length > 0 && (
                <button onClick={() => { setError(""); setShowSchedForm(true); }} className="text-sm px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50">
                  + Schedule
                </button>
              )}
              <button onClick={() => { setError(""); setShowMedForm(true); }} className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                + Medicament
              </button>
            </div>
          </div>
          {meds.length === 0 ? (
            <p className="text-sm text-gray-400">Aucun medicament enregistre.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {meds.map((m) => (
                <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900">{m.name}</p>
                    <span className="text-sm text-gray-500">{m.dosageLabel}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{m.instructionsLabel}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Prescrit par : {m.prescribingSourceLabel}</p>
                  {m.schedules?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.schedules.map((s: any) => (
                        <span key={s.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {s.timeOfDay} · {s.recurrenceRule}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alerts tab */}
      {tab === "alerts" && (
        <div className="flex flex-col gap-2">
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400">Aucune alerte.</p>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
                <div className="flex gap-2 mb-1">
                  <Badge value={a.severity} />
                  <Badge value={a.type} />
                  <Badge value={a.status} />
                </div>
                <p className="text-sm text-gray-800">{a.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(a.createdAt).toLocaleString("fr-FR")}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal: add medication */}
      {showMedForm && (
        <Modal title="Nouveau medicament" onClose={() => setShowMedForm(false)}>
          <form onSubmit={submitMed} className="flex flex-col gap-4">
            <FormField label="Nom *"><input className={inputCls} value={medForm.name} onChange={(e) => setMedForm((f) => ({ ...f, name: e.target.value }))} required /></FormField>
            <FormField label="Dosage (affichage uniquement)"><input className={inputCls} value={medForm.dosageLabel} onChange={(e) => setMedForm((f) => ({ ...f, dosageLabel: e.target.value }))} placeholder="ex: 500 mg" /></FormField>
            <FormField label="Instructions"><input className={inputCls} value={medForm.instructionsLabel} onChange={(e) => setMedForm((f) => ({ ...f, instructionsLabel: e.target.value }))} placeholder="ex: Avec un verre d eau" /></FormField>
            <FormField label="Source (medecin / ordonnance)"><input className={inputCls} value={medForm.prescribingSourceLabel} onChange={(e) => setMedForm((f) => ({ ...f, prescribingSourceLabel: e.target.value }))} /></FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowMedForm(false)} className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "Creer"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: add schedule */}
      {showSchedForm && (
        <Modal title="Nouveau schedule" onClose={() => setShowSchedForm(false)}>
          <form onSubmit={submitSched} className="flex flex-col gap-4">
            <FormField label="Medicament *">
              <select className={inputCls} value={schedForm.medicationId} onChange={(e) => setSchedForm((f) => ({ ...f, medicationId: e.target.value }))} required>
                <option value="">-- Choisir --</option>
                {meds.map((m) => <option key={m.id} value={m.id}>{m.name} {m.dosageLabel}</option>)}
              </select>
            </FormField>
            <FormField label="Heure (HH:MM) *"><input className={inputCls} value={schedForm.timeOfDay} onChange={(e) => setSchedForm((f) => ({ ...f, timeOfDay: e.target.value }))} pattern="\d{2}:\d{2}" required /></FormField>
            <FormField label="Date de debut *"><input type="date" className={inputCls} value={schedForm.startDate} onChange={(e) => setSchedForm((f) => ({ ...f, startDate: e.target.value }))} required /></FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowSchedForm(false)} className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "Creer"}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: confirm reminder */}
      {showConfirmForm && (
        <Modal title="Confirmer le rappel" onClose={() => setShowConfirmForm(null)}>
          <form onSubmit={submitConfirm} className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Medicament : <strong>{showConfirmForm.medicationSchedule?.medication?.name}</strong><br />
              Prevu : {new Date(showConfirmForm.scheduledAt).toLocaleString("fr-FR")}
            </p>
            <FormField label="Statut">
              <select className={inputCls} value={confirmStatus} onChange={(e) => setConfirmStatus(e.target.value)}>
                <option value="confirmed_taken">Pris</option>
                <option value="confirmed_not_taken">Non pris</option>
                <option value="unknown">Incertain</option>
                <option value="missed">Manque</option>
              </select>
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowConfirmForm(null)} className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "Confirmer"}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
