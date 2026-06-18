const colors: Record<string, string> = {
  low: "bg-gray-100 text-gray-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
  created: "bg-blue-100 text-blue-800",
  sent: "bg-purple-100 text-purple-800",
  acknowledged: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  scheduled: "bg-gray-100 text-gray-600",
  delivered: "bg-blue-100 text-blue-700",
  confirmed_taken: "bg-green-100 text-green-800",
  confirmed_not_taken: "bg-red-100 text-red-800",
  unknown: "bg-yellow-100 text-yellow-800",
  missed: "bg-red-200 text-red-900",
  escalated: "bg-purple-100 text-purple-800",
  granted: "bg-green-100 text-green-700",
  guardian_granted: "bg-blue-100 text-blue-700",
  pending: "bg-gray-100 text-gray-600",
  revoked: "bg-red-100 text-red-700",
};

export function Badge({ value }: { value: string }) {
  const cls = colors[value] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}
