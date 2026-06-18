"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getResidents, createResident } from "@/lib/api";
import { Badge } from "@/components/Badge";
import { Modal } from "@/components/Modal";
import { FormField, inputCls } from "@/components/FormField";

const EMPTY = {
  firstName: "",
  preferredName: "",
  dateOfBirth: "",
  language: "fr",
  consentStatus: "granted",
  privacySettings: {
    storeAudio: false,
    storeTranscripts: false,
    shareDataWithFamily: true,
    allowAiConversation: true,
  },
};

export default function ResidentsPage() {
  const [residents, setResidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setResidents(await getResidents()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function set(field: string, value: any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createResident(form);
      setShowForm(false);
      setForm(EMPTY);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Residents</h1>
        <button
          onClick={() => setShowForm(true)}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          + Nouveau resident
        </button>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Chargement...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {residents.map((r) => (
            <Link
              key={r.id}
              href={`/residents/${r.id}`}
              className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition block"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{r.firstName}</p>
                  {r.preferredName && r.preferredName !== r.firstName && (
                    <p className="text-sm text-gray-500">{r.preferredName}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(r.dateOfBirth).toLocaleDateString("fr-FR")}
                  </p>
                </div>
                <Badge value={r.consentStatus} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title="Nouveau resident" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FormField label="Prenom *">
              <input className={inputCls} value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required />
            </FormField>
            <FormField label="Nom de preference">
              <input className={inputCls} value={form.preferredName} onChange={(e) => set("preferredName", e.target.value)} />
            </FormField>
            <FormField label="Date de naissance *">
              <input type="date" className={inputCls} value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} required />
            </FormField>
            <FormField label="Langue">
              <select className={inputCls} value={form.language} onChange={(e) => set("language", e.target.value)}>
                <option value="fr">Francais</option>
                <option value="en">English</option>
              </select>
            </FormField>
            <FormField label="Consentement">
              <select className={inputCls} value={form.consentStatus} onChange={(e) => set("consentStatus", e.target.value)}>
                <option value="granted">Accorde</option>
                <option value="guardian_granted">Accorde par tuteur</option>
                <option value="pending">En attente</option>
              </select>
            </FormField>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Confidentialite</label>
              {[
                { key: "allowAiConversation", label: "Autoriser la conversation IA" },
                { key: "shareDataWithFamily", label: "Partager les donnees avec la famille" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={(form.privacySettings as any)[key]}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        privacySettings: { ...f.privacySettings, [key]: e.target.checked },
                      }))
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={() => setShowForm(false)} className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50">Annuler</button>
              <button type="submit" disabled={saving} className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Enregistrement..." : "Creer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
