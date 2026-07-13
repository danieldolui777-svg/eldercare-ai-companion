"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  getResident, getMedications, getSchedules, getReminders, getAlertsForResident,
  createMedication, createSchedule, createReminderEvent, confirmReminder,
  updateResident, getMemory, deleteMemory,
  createDeviceToken, getDevices, revokeDevice,
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
  const [memories, setMemories] = useState<any[]>([]);
  const [tab, setTab] = useState<"reminders" | "medications" | "alerts" | "memory">("reminders");

  const [showMedForm, setShowMedForm] = useState(false);
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState<any>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [newToken, setNewToken] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [r, m, s, rem, al, mem] = await Promise.all([
      getResident(id),
      getMedications(id),
      getSchedules(id),
      getReminders(id),
      getAlertsForResident(id),
      getMemory(id).catch(() => []),
    ]);
    setResident(r);
    setMeds(Array.isArray(m) ? m : []);
    setSchedules(Array.isArray(s) ? s : []);
    setReminders(Array.isArray(rem) ? rem : []);
    setAlerts(Array.isArray(al) ? al : []);
    setMemories(Array.isArray(mem) ? mem : []);
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

  // ---- Edit profile (gender, family contact, memory settings) ----
  const [profileForm, setProfileForm] = useState<any>(null);
  function openProfile() {
    const p = resident.privacySettings ?? {};
    setProfileForm({
      gender: resident.gender ?? "",
      familyContactName: resident.familyContactName ?? "",
      familyContactRelation: resident.familyContactRelation ?? "",
      storeMemory: p.storeMemory !== false,
      storeTranscripts: p.storeTranscripts === true,
    });
    setError("");
    setShowProfileForm(true);
  }
  async function submitProfile(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    try {
      await updateResident(id, {
        gender: profileForm.gender || undefined,
        familyContactName: profileForm.familyContactName || undefined,
        familyContactRelation: profileForm.familyContactRelation || undefined,
        privacySettings: {
          ...(resident.privacySettings ?? {}),
          storeMemory: profileForm.storeMemory,
          storeTranscripts: profileForm.storeTranscripts,
        },
      });
      setShowProfileForm(false);
      await load();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }

  // ---- Delete a remembered fact ----
  async function removeMemory(memId: string) {
    setSaving(true);
    try { await deleteMemory(memId); await load(); }
    finally { setSaving(false); }
  }

  // ---- Device pairing ----
  async function openDevices() {
    setError(""); setNewToken(""); setShowDevices(true);
    try { setDevices(await getDevices(id)); } catch { setDevices([]); }
  }
  async function generateDevice() {
    setSaving(true); setError("");
    try {
      const res = await createDeviceToken(id, "Appareil");
      setNewToken(res.token);
      setDevices(await getDevices(id));
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  }
  async function killDevice(devId: string) {
    setSaving(true);
    try { await revokeDevice(devId); setDevices(await getDevices(id)); }
    finally { setSaving(false); }
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
              Né(e) le {new Date(resident.dateOfBirth).toLocaleDateString("fr-FR")}
              {resident.gender && ` · ${GENDER_LABELS[resident.gender] ?? resident.gender}`}
              {" · Langue : "}{resident.language}
            </p>
            {(resident.familyContactName || resident.familyContactRelation) && (
              <p className="text-xs text-gray-500 mt-1">
                Contact famille : {resident.familyContactName}
                {resident.familyContactRelation && ` (${resident.familyContactRelation})`}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge value={resident.consentStatus} />
            <div className="flex gap-2">
              <button
                onClick={openDevices}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                📱 Appareils
              </button>
              <button
                onClick={openProfile}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                Éditer le profil
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(["reminders", "medications", "alerts", "memory"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize transition ${
              tab === t ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {t === "reminders" ? "Rappels" : t === "medications" ? "Medicaments" : t === "alerts" ? "Alertes" : "Mémoire"}
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

      {/* Memory tab */}
      {tab === "memory" && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm text-gray-500">
              {memories.length} souvenir(s) — ce que le compagnon retient
            </p>
            <span className={`text-xs px-2 py-1 rounded-full ${
              resident.privacySettings?.storeMemory === false
                ? "bg-gray-100 text-gray-500"
                : "bg-green-50 text-green-700"
            }`}>
              {resident.privacySettings?.storeMemory === false ? "Mémoire désactivée" : "Mémoire active"}
            </span>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Faits non-médicaux distillés des conversations. Supprimez tout élément inexact.
          </p>
          {memories.length === 0 ? (
            <p className="text-sm text-gray-400">
              Aucun souvenir pour l&apos;instant. Ils apparaissent après des conversations.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {memories.map((mem) => (
                <div key={mem.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between shadow-sm">
                  <div>
                    <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded mr-2">
                      {MEMORY_CATEGORY_LABELS[mem.category] ?? mem.category}
                    </span>
                    <span className="text-sm text-gray-800">{mem.content}</span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(mem.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  <button
                    onClick={() => removeMemory(mem.id)}
                    disabled={saving}
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
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

      {/* Modal: edit profile */}
      {showProfileForm && profileForm && (
        <Modal title="Profil du résident" onClose={() => setShowProfileForm(false)}>
          <form onSubmit={submitProfile} className="flex flex-col gap-4">
            <FormField label="Genre">
              <select className={inputCls} value={profileForm.gender} onChange={(e) => setProfileForm((f: any) => ({ ...f, gender: e.target.value }))}>
                <option value="">— Non précisé —</option>
                <option value="female">Femme</option>
                <option value="male">Homme</option>
                <option value="other">Autre</option>
                <option value="unspecified">Préfère ne pas dire</option>
              </select>
            </FormField>
            <FormField label="Contact famille — nom">
              <input className={inputCls} value={profileForm.familyContactName} onChange={(e) => setProfileForm((f: any) => ({ ...f, familyContactName: e.target.value }))} placeholder="ex: Paul Dupont" />
            </FormField>
            <FormField label="Contact famille — lien">
              <input className={inputCls} value={profileForm.familyContactRelation} onChange={(e) => setProfileForm((f: any) => ({ ...f, familyContactRelation: e.target.value }))} placeholder="ex: fils, fille, voisin" />
            </FormField>

            <div className="border-t border-gray-200 pt-3 mt-1">
              <p className="text-sm font-medium text-gray-700 mb-2">Mémoire & confidentialité</p>
              <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
                <input type="checkbox" checked={profileForm.storeMemory} onChange={(e) => setProfileForm((f: any) => ({ ...f, storeMemory: e.target.checked }))} />
                Mémoire du compagnon (faits non-médicaux)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={profileForm.storeTranscripts} onChange={(e) => setProfileForm((f: any) => ({ ...f, storeTranscripts: e.target.checked }))} />
                Enregistrer les conversations mot-à-mot (verbatim)
              </label>
              <p className="text-xs text-gray-400 mt-1">
                Le verbatim est sensible — à n&apos;activer qu&apos;avec le consentement du résident.
              </p>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowProfileForm(false)} className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "..." : "Enregistrer"}</button>
            </div>
          </form>
        </Modal>
      )}
      {/* Modal: device pairing */}
      {showDevices && (
        <Modal title="Appareils appairés" onClose={() => setShowDevices(false)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Un appareil (tablette/téléphone) est lié à <strong>{resident.firstName}</strong>.
              Générez un code, puis collez-le dans l&apos;app sur l&apos;appareil du résident.
            </p>

            {newToken && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800 font-medium mb-1">
                  Code d&apos;appairage (affiché une seule fois — copiez-le maintenant) :
                </p>
                <code className="block text-xs break-all bg-white border border-amber-200 rounded p-2 select-all">
                  {newToken}
                </code>
                <button
                  onClick={() => navigator.clipboard?.writeText(newToken).catch(() => {})}
                  className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white"
                >
                  Copier
                </button>
              </div>
            )}

            <button
              onClick={generateDevice}
              disabled={saving}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 self-start"
            >
              {saving ? "…" : "+ Générer un code d'appairage"}
            </button>

            <div className="flex flex-col gap-2">
              {devices.length === 0 ? (
                <p className="text-sm text-gray-400">Aucun appareil appairé.</p>
              ) : (
                devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-2.5">
                    <div>
                      <p className="text-sm text-gray-800">
                        {d.label ?? "Appareil"}
                        {d.revokedAt && <span className="text-red-500 text-xs ml-2">(révoqué)</span>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {d.lastSeenAt ? `Vu le ${new Date(d.lastSeenAt).toLocaleString("fr-FR")}` : "Jamais utilisé"}
                      </p>
                    </div>
                    {!d.revokedAt && (
                      <button
                        onClick={() => killDevice(d.id)}
                        disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 text-red-600 hover:bg-red-50"
                      >
                        Révoquer
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

const GENDER_LABELS: Record<string, string> = {
  female: "Femme",
  male: "Homme",
  other: "Autre",
  unspecified: "Non précisé",
};

const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  family: "Famille",
  preference: "Goûts",
  life_history: "Parcours",
  routine: "Habitudes",
  other: "Divers",
};
