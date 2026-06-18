import { z } from "zod";

export const MedicationSchema = z.object({
  id: z.string().uuid(),
  residentId: z.string().uuid(),
  name: z.string().min(1),
  // Display-only label. The AI must never read or modify dosage programmatically.
  dosageLabel: z.string(),
  instructionsLabel: z.string(),
  prescribingSourceLabel: z.string(),
  active: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateMedicationSchema = MedicationSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateMedicationSchema = CreateMedicationSchema.partial();

export const MedicationScheduleSchema = z.object({
  id: z.string().uuid(),
  medicationId: z.string().uuid(),
  residentId: z.string().uuid(),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  recurrenceRule: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  active: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateMedicationScheduleSchema = MedicationScheduleSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateMedicationScheduleSchema = CreateMedicationScheduleSchema.partial();

export type Medication = z.infer<typeof MedicationSchema>;
export type CreateMedication = z.infer<typeof CreateMedicationSchema>;
export type UpdateMedication = z.infer<typeof UpdateMedicationSchema>;
export type MedicationSchedule = z.infer<typeof MedicationScheduleSchema>;
export type CreateMedicationSchedule = z.infer<typeof CreateMedicationScheduleSchema>;
export type UpdateMedicationSchedule = z.infer<typeof UpdateMedicationScheduleSchema>;
