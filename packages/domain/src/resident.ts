import { z } from "zod";

export const ConsentStatusSchema = z.enum([
  "pending",
  "granted",
  "revoked",
  "guardian_granted",
]);

export const GenderSchema = z.enum([
  "female",
  "male",
  "other",
  "unspecified",
]);

export const PrivacySettingsSchema = z.object({
  storeAudio: z.boolean().default(false),
  storeTranscripts: z.boolean().default(false),
  // Curated, non-medical companion memory. On by default; opt out to disable.
  storeMemory: z.boolean().default(true),
  shareDataWithFamily: z.boolean().default(true),
  allowAiConversation: z.boolean().default(true),
});

export const ResidentSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string().min(1),
  preferredName: z.string().optional(),
  dateOfBirth: z.coerce.date(),
  gender: GenderSchema.optional(),
  familyContactName: z.string().optional(),
  familyContactRelation: z.string().optional(),
  language: z.string().default("fr"),
  voicePreferences: z.record(z.unknown()).default({}),
  consentStatus: ConsentStatusSchema,
  privacySettings: PrivacySettingsSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const CreateResidentSchema = ResidentSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const UpdateResidentSchema = CreateResidentSchema.partial();

export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export type Gender = z.infer<typeof GenderSchema>;
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type CreateResident = z.infer<typeof CreateResidentSchema>;
export type UpdateResident = z.infer<typeof UpdateResidentSchema>;
