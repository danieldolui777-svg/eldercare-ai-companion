"use client";
import { useEffect, useState, useCallback } from "react";
import { getAlerts, acknowledgeAlert, resolveAlert, generateReminders, detectMissed } from "@/lib/api";
import { Badge } from "@/components/Badge";

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAlerts();
      setAlerts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAck(id: string) {
    setBusy(id);
    await acknowledgeAlert(id);
    await load();
    setBusy(null);
  }

  async function handleResolve(id: string) {
    setBusy(id);
    await resolveAlert(id);
    await load();
    setBusy(null);
  }

  async function handleGenerate() {
    setBusy("gen");
    await generateReminders();
    setBusy(null);
    alert("Reminders du jour generes.");
  }

  async function handleDetect() {
    setBusy("detect");
    await detectMissed();
    await load();
    setBusy(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alertes actives</h1>
          <p className="text-sm text-gray-500 mt-1">
            {alerts.length === 0 ? "Aucune alerte active" : `${alerts.length} alerte(s) en attente`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleDetect}
            disabled={busy === "detect"}
            className="text-sm px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            {busy === "detect" ? "..." : "Detecter manques"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={busy === "gen"}
            className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "gen" ? "..." : "Generer reminders"}
          </button>
          <button onClick={load} className="text-sm px-3 py-2 rounded-lg border hover:bg-gray-50">
            Rafraichir
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-gray-400 text-sm">Chargement...</div>
      ) : alerts.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center text-green-700">
          Aucune alerte active. Tout va bien.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="bg-white border border-gray-200 rounded-xl p-4 flex items-start gap-4 shadow-sm"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge value={alert.severity} />
                  <Badge value={alert.type} />
                  <Badge value={alert.status} />
                </div>
                <p className="text-sm text-gray-800 mt-1">{alert.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {alert.resident?.firstName ?? ""} —{" "}
                  {new Date(alert.createdAt).toLocaleString("fr-FR")}
                </p>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {alert.status === "created" || alert.status === "sent" ? (
                  <>
                    <button
                      onClick={() => handleAck(alert.id)}
                      disabled={busy === alert.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50"
                    >
                      Acquitter
                    </button>
                    <button
                      onClick={() => handleResolve(alert.id)}
                      disabled={busy === alert.id}
                      className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                    >
                      Resoudre
                    </button>
                  </>
                ) : alert.status === "acknowledged" ? (
                  <button
                    onClick={() => handleResolve(alert.id)}
                    disabled={busy === alert.id}
                    className="text-xs px-3 py-1.5 rounded-lg bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
                  >
                    Resoudre
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
