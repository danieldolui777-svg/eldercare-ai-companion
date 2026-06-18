import { z } from "zod";
export declare const AlertTypeSchema: z.ZodEnum<["missed_medication", "medication_uncertainty", "emergency_phrase", "wellbeing_concern", "device_offline", "other"]>;
export declare const AlertSeveritySchema: z.ZodEnum<["low", "medium", "high", "critical"]>;
export declare const AlertStatusSchema: z.ZodEnum<["created", "sent", "acknowledged", "resolved", "failed"]>;
export declare const AlertSchema: z.ZodObject<{
    id: z.ZodString;
    residentId: z.ZodString;
    type: z.ZodEnum<["missed_medication", "medication_uncertainty", "emergency_phrase", "wellbeing_concern", "device_offline", "other"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    status: z.ZodEnum<["created", "sent", "acknowledged", "resolved", "failed"]>;
    message: z.ZodString;
    assignedToCaregiverId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    acknowledgedAt: z.ZodOptional<z.ZodDate>;
    resolvedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    message: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    status: "created" | "sent" | "acknowledged" | "resolved" | "failed";
    id: string;
    createdAt: Date;
    residentId: string;
    severity: "low" | "medium" | "high" | "critical";
    assignedToCaregiverId?: string | undefined;
    acknowledgedAt?: Date | undefined;
    resolvedAt?: Date | undefined;
}, {
    message: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    status: "created" | "sent" | "acknowledged" | "resolved" | "failed";
    id: string;
    createdAt: Date;
    residentId: string;
    severity: "low" | "medium" | "high" | "critical";
    assignedToCaregiverId?: string | undefined;
    acknowledgedAt?: Date | undefined;
    resolvedAt?: Date | undefined;
}>;
export declare const CreateAlertSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    residentId: z.ZodString;
    type: z.ZodEnum<["missed_medication", "medication_uncertainty", "emergency_phrase", "wellbeing_concern", "device_offline", "other"]>;
    severity: z.ZodEnum<["low", "medium", "high", "critical"]>;
    status: z.ZodEnum<["created", "sent", "acknowledged", "resolved", "failed"]>;
    message: z.ZodString;
    assignedToCaregiverId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    acknowledgedAt: z.ZodOptional<z.ZodDate>;
    resolvedAt: z.ZodOptional<z.ZodDate>;
}, "status" | "id" | "createdAt" | "acknowledgedAt" | "resolvedAt">, "strip", z.ZodTypeAny, {
    message: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    residentId: string;
    severity: "low" | "medium" | "high" | "critical";
    assignedToCaregiverId?: string | undefined;
}, {
    message: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    residentId: string;
    severity: "low" | "medium" | "high" | "critical";
    assignedToCaregiverId?: string | undefined;
}>;
export type AlertType = z.infer<typeof AlertTypeSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type CreateAlert = z.infer<typeof CreateAlertSchema>;
//# sourceMappingURL=alert.d.ts.map