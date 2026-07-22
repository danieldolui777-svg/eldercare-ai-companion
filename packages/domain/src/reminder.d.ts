import { z } from "zod";
export declare const ReminderStatusSchema: z.ZodEnum<["scheduled", "delivered", "confirmed_taken", "confirmed_not_taken", "unknown", "missed", "escalated"]>;
export declare const ConfirmationSourceSchema: z.ZodEnum<["voice", "caregiver", "dashboard", "manual"]>;
export declare const ReminderEventSchema: z.ZodObject<{
    id: z.ZodString;
    residentId: z.ZodString;
    medicationScheduleId: z.ZodString;
    scheduledAt: z.ZodDate;
    deliveredAt: z.ZodOptional<z.ZodDate>;
    status: z.ZodEnum<["scheduled", "delivered", "confirmed_taken", "confirmed_not_taken", "unknown", "missed", "escalated"]>;
    confirmationSource: z.ZodOptional<z.ZodEnum<["voice", "caregiver", "dashboard", "manual"]>>;
    transcriptSnippet: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    residentId: string;
    status: "scheduled" | "delivered" | "confirmed_taken" | "confirmed_not_taken" | "unknown" | "missed" | "escalated";
    createdAt: Date;
    updatedAt: Date;
    medicationScheduleId: string;
    scheduledAt: Date;
    deliveredAt?: Date | undefined;
    confirmationSource?: "caregiver" | "voice" | "dashboard" | "manual" | undefined;
    transcriptSnippet?: string | undefined;
}, {
    id: string;
    residentId: string;
    status: "scheduled" | "delivered" | "confirmed_taken" | "confirmed_not_taken" | "unknown" | "missed" | "escalated";
    createdAt: Date;
    updatedAt: Date;
    medicationScheduleId: string;
    scheduledAt: Date;
    deliveredAt?: Date | undefined;
    confirmationSource?: "caregiver" | "voice" | "dashboard" | "manual" | undefined;
    transcriptSnippet?: string | undefined;
}>;
export declare const ConfirmReminderSchema: z.ZodObject<{
    status: z.ZodEnum<["confirmed_taken", "confirmed_not_taken", "unknown", "missed"]>;
    confirmationSource: z.ZodEnum<["voice", "caregiver", "dashboard", "manual"]>;
    transcriptSnippet: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "confirmed_taken" | "confirmed_not_taken" | "unknown" | "missed";
    confirmationSource: "caregiver" | "voice" | "dashboard" | "manual";
    transcriptSnippet?: string | undefined;
}, {
    status: "confirmed_taken" | "confirmed_not_taken" | "unknown" | "missed";
    confirmationSource: "caregiver" | "voice" | "dashboard" | "manual";
    transcriptSnippet?: string | undefined;
}>;
export declare const STATUSES_REQUIRING_ALERT: Set<string>;
export type ReminderStatus = z.infer<typeof ReminderStatusSchema>;
export type ConfirmationSource = z.infer<typeof ConfirmationSourceSchema>;
export type ReminderEvent = z.infer<typeof ReminderEventSchema>;
export type ConfirmReminder = z.infer<typeof ConfirmReminderSchema>;
//# sourceMappingURL=reminder.d.ts.map