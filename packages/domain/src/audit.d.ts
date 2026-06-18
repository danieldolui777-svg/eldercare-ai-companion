import { z } from "zod";
export declare const AuditActorTypeSchema: z.ZodEnum<["resident", "caregiver", "system", "ai"]>;
export declare const AuditLogSchema: z.ZodObject<{
    id: z.ZodString;
    actorType: z.ZodEnum<["resident", "caregiver", "system", "ai"]>;
    actorId: z.ZodOptional<z.ZodString>;
    action: z.ZodString;
    entityType: z.ZodString;
    entityId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    actorType: "resident" | "caregiver" | "system" | "ai";
    action: string;
    entityType: string;
    metadata: Record<string, unknown>;
    actorId?: string | undefined;
    entityId?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    actorType: "resident" | "caregiver" | "system" | "ai";
    action: string;
    entityType: string;
    actorId?: string | undefined;
    entityId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export declare const CreateAuditLogSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    actorType: z.ZodEnum<["resident", "caregiver", "system", "ai"]>;
    actorId: z.ZodOptional<z.ZodString>;
    action: z.ZodString;
    entityType: z.ZodString;
    entityId: z.ZodOptional<z.ZodString>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    createdAt: z.ZodDate;
}, "id" | "createdAt">, "strip", z.ZodTypeAny, {
    actorType: "resident" | "caregiver" | "system" | "ai";
    action: string;
    entityType: string;
    metadata: Record<string, unknown>;
    actorId?: string | undefined;
    entityId?: string | undefined;
}, {
    actorType: "resident" | "caregiver" | "system" | "ai";
    action: string;
    entityType: string;
    actorId?: string | undefined;
    entityId?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;
export type CreateAuditLog = z.infer<typeof CreateAuditLogSchema>;
//# sourceMappingURL=audit.d.ts.map