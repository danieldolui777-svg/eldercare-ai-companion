"use client";
import { useEffect, useState, useCallback } from "react";
import {
  getUsers,
  createUser,
  resetUserPassword,
  type UserAccount,
} from "@/lib/api";
import { Modal } from "@/components/Modal";
import { FormField, inputCls } from "@/components/FormField";

const ROLES = [
  { value: "nurse", label: "Soignant" },
  { value: "facility_staff", label: "Personnel etablissement" },
  { value: "family", label: "Famille" },
  { value: "admin", label: "Administrateur" },
];

const EMPTY = { name: "", email: "", role: "nurse", phone: "", password: "" };

const roleLabel = (role: string) =>
  ROLES.find((r) => r.value === role)?.label ?? role;

export default function UsersPage() {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resetting, setResetting] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setUsers(await getUsers());
    } catch (err: any) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function set(field: string, value: any) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createUser({
        name: form.name,
        email: form.email,
        role: form.role,
        phone: form.phone || undefined,
        password: form.password,
      });
      setShowForm(false);
      setNotice(
        `Compte cree pour ${form.email}. Transmettez-lui le mot de passe par un canal sur, puis changez-le a la premiere connexion.`,
      );
      setForm(EMPTY);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetting) return;
    setSaving(true);
    setError("");
    try {
      await resetUserPassword(resetting.id, newPassword);
      setNotice(`Mot de passe reinitialise pour ${resetting.email}.`);
      setResetting(null);
      setNewPassword("");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Utilisateurs</h1>
        <button
          onClick={() => {
            setForm(EMPTY);
            setError("");
            setShowForm(true);
          }}
          className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          + Nouveau compte
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Comptes pouvant se connecter au tableau de bord. Reserve aux
        administrateurs.
      </p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-900">
        <p className="font-semibold">Acces non cloisonne</p>
        <p className="mt-1">
          Le role est enregistre mais n&apos;est pas encore applique : toute
          personne disposant d&apos;un compte voit et modifie{" "}
          <strong>tous</strong> les residents, leurs medicaments et leurs
          alertes. Ne creez des comptes que pour des personnes autorisees a
          consulter l&apos;ensemble des dossiers.
        </p>
      </div>

      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm text-green-900 flex items-start justify-between gap-4">
          <p>{notice}</p>
          <button
            onClick={() => setNotice("")}
            className="text-green-700 hover:text-green-900 shrink-0"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-gray-400 text-sm">Chargement...</div>
      ) : loadError ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">
          <p className="font-semibold">Impossible de charger les comptes</p>
          <p className="mt-1">{loadError}</p>
          <p className="mt-2 text-red-700">
            Cette page est reservee aux administrateurs.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm divide-y">
          {users.map((u) => (
            <div
              key={u.id}
              className="p-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900 truncate">{u.name}</p>
                <p className="text-sm text-gray-500 truncate">{u.email}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {roleLabel(u.role)}
                  </span>
                  {u.canLogIn ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                      Peut se connecter
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Contact seulement
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setResetting(u);
                  setNewPassword("");
                  setError("");
                }}
                className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50 shrink-0"
              >
                {u.canLogIn ? "Reinitialiser" : "Definir un mot de passe"}
              </button>
            </div>
          ))}
          {users.length === 0 && (
            <p className="p-4 text-sm text-gray-400">Aucun compte.</p>
          )}
        </div>
      )}

      {showForm && (
        <Modal title="Nouveau compte" onClose={() => setShowForm(false)}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FormField label="Nom *">
              <input
                className={inputCls}
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Email *">
              <input
                type="email"
                className={inputCls}
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                required
              />
            </FormField>
            <FormField label="Role">
              <select
                className={inputCls}
                value={form.role}
                onChange={(e) => set("role", e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Telephone">
              <input
                className={inputCls}
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </FormField>
            <FormField label="Mot de passe * (8 caracteres minimum)">
              <input
                type="password"
                className={inputCls}
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                minLength={8}
                required
              />
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Creation..." : "Creer le compte"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetting && (
        <Modal
          title={`Mot de passe — ${resetting.name}`}
          onClose={() => setResetting(null)}
        >
          <form onSubmit={submitReset} className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Definit un nouveau mot de passe pour{" "}
              <strong>{resetting.email}</strong>. L&apos;ancien cesse
              immediatement de fonctionner.
            </p>
            <FormField label="Nouveau mot de passe * (8 caracteres minimum)">
              <input
                type="password"
                className={inputCls}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                required
              />
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setResetting(null)}
                className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
