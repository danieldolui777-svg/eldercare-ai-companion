import { z } from "zod";

export const CaregiverRoleSchema = z.enum([
  "family",
  "nurse",
  "facility_staff",
  "admin",
]);

export const NotificationPreferencesSchema = z.object({
  sms: z.boolean().default(false),
  email: z.boolean().default(true),
  push: z.boolean().default(false),
  minSeverityForSms: z.enum(["low", "medium", "high", "critical"]).default("high"),
});

export const CaregiverSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  role: CaregiverRoleSchema,
  phone: z.string().optional(),
  email: z.string().email(),
  notificationPreferences: NotificationPreferencesSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateCaregiverSchema = CaregiverSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateCaregiverSchema = CreateCaregiverSchema.partial();

export type CaregiverRole = z.infer<typeof CaregiverRoleSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type Caregiver = z.infer<typeof CaregiverSchema>;
export type CreateCaregiver = z.infer<typeof CreateCaregiverSchema>;
export type UpdateCaregiver = z.infer<typeof UpdateCaregiverSchema>;
