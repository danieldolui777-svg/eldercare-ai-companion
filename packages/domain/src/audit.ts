import { z } from "zod";

export const AuditActorTypeSchema = z.enum([
  "resident",
  "caregiver",
  "system",
  "ai",
]);

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  actorType: AuditActorTypeSchema,
  actorId: z.string().optional(),
  action: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.coerce.date(),
});

export const CreateAuditLogSchema = AuditLogSchema.omit({
  id: true,
  createdAt: true,
});

export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type CreateAuditLog = z.infer<typeof CreateAuditLogSchema>;
