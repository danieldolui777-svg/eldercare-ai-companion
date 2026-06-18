import { z } from "zod";

export const ReminderStatusSchema = z.enum([
  "scheduled",
  "delivered",
  "confirmed_taken",
  "confirmed_not_taken",
  "unknown",
  "missed",
  "escalated",
]);

export const ConfirmationSourceSchema = z.enum([
  "voice",
  "caregiver",
  "dashboard",
  "manual",
]);

export const ReminderEventSchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  medicationScheduleId: z.string().uuid(),
  scheduledAt: z.coerce.date(),
  deliveredAt: z.coerce.date().optional(),
  status: ReminderStatusSchema,
  confirmationSource: ConfirmationSourceSchema.optional(),
  transcriptSnippet: z.string().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const ConfirmReminderSchema = z.object({
  status: z.enum([
    "confirmed_taken",
    "confirmed_not_taken",
    "unknown",
    "missed",
  ]),
  confirmationSource: ConfirmationSourceSchema,
  transcriptSnippet: z.string().optional(),
});

export const STATUSES_REQUIRING_ALERT = new Set<string>([
  "confirmed_not_taken",
  "unknown",
  "missed",
]);

export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export type ConfirmationSource = z.infer<typeof ConfirmationSourceSchema>;
export type ReminderEvent = z.infer<typeof ReminderEventSchema>;
export type ConfirmReminder = z.infer<typeof ConfirmReminderSchema>;
