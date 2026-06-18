import { z } from "zod";

export const AlertTypeSchema = z.enum([
  "missed_medication",
  "medication_uncertainty",
  "emergency_phrase",
  "wellbeing_concern",
  "device_offline",
  "other",
]);

export const AlertSeveritySchema = z.enum(["low", "medium", "high", "critical"]);

export const AlertStatusSchema = z.enum([
  "created",
  "sent",
  "acknowledged",
  "resolved",
  "failed",
]);

export const AlertSchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  type: AlertTypeSchema,
  severity: AlertSeveritySchema,
  status: AlertStatusSchema,
  message: z.string().min(1),
  assignedToCaregiverId: z.string().uuid().optional(),
  createdAt: z.coerce.date(),
  acknowledgedAt: z.coerce.date().optional(),
  resolvedAt: z.coerce.date().optional(),
});

export const CreateAlertSchema = AlertSchema.omit({
  id: true,
  status: true,
  createdAt: true,
  acknowledgedAt: true,
  resolvedAt: true,
});

export type AlertType = z.infer<typeof AlertTypeSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type CreateAlert = z.infer<typeof CreateAlertSchema>;
