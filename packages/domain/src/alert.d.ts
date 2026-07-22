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
    id: string;
    residentId: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    severity: "low" | "medium" | "high" | "critical";
    status: "created" | "sent" | "acknowledged" | "resolved" | "failed";
    message: string;
    createdAt: Date;
    assignedToCaregiverId?: string | undefined;
    acknowledgedAt?: Date | undefined;
    resolvedAt?: Date | undefined;
}, {
    id: string;
    residentId: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    severity: "low" | "medium" | "high" | "critical";
    status: "created" | "sent" | "acknowledged" | "resolved" | "failed";
    message: string;
    createdAt: Date;
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
}, "id" | "status" | "createdAt" | "acknowledgedAt" | "resolvedAt">, "strip", z.ZodTypeAny, {
    residentId: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    assignedToCaregiverId?: string | undefined;
}, {
    residentId: string;
    type: "missed_medication" | "medication_uncertainty" | "emergency_phrase" | "wellbeing_concern" | "device_offline" | "other";
    severity: "low" | "medium" | "high" | "critical";
    message: string;
    assignedToCaregiverId?: string | undefined;
}>;
export type AlertType = z.infer<typeof AlertTypeSchema>;
export type AlertSeverity = z.infer<typeof AlertSeveritySchema>;
export type AlertStatus = z.infer<typeof AlertStatusSchema>;
export type Alert = z.infer<typeof AlertSchema>;
export type CreateAlert = z.infer<typeof CreateAlertSchema>;
//# sourceMappingURL=alert.d.ts.map