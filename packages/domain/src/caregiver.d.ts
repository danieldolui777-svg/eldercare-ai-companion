import { z } from "zod";
export declare const CaregiverRoleSchema: z.ZodEnum<["family", "nurse", "facility_staff", "admin"]>;
export declare const NotificationPreferencesSchema: z.ZodObject<{
    sms: z.ZodDefault<z.ZodBoolean>;
    email: z.ZodDefault<z.ZodBoolean>;
    push: z.ZodDefault<z.ZodBoolean>;
    minSeverityForSms: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
}, "strip", z.ZodTypeAny, {
    push: boolean;
    sms: boolean;
    email: boolean;
    minSeverityForSms: "low" | "medium" | "high" | "critical";
}, {
    push?: boolean | undefined;
    sms?: boolean | undefined;
    email?: boolean | undefined;
    minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
}>;
export declare const CaregiverSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["family", "nurse", "facility_staff", "admin"]>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    notificationPreferences: z.ZodObject<{
        sms: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        minSeverityForSms: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    }, "strip", z.ZodTypeAny, {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    }, {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    notificationPreferences: {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    };
    updatedAt: Date;
    phone?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    notificationPreferences: {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    };
    updatedAt: Date;
    phone?: string | undefined;
}>;
export declare const CreateCaregiverSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["family", "nurse", "facility_staff", "admin"]>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodString;
    notificationPreferences: z.ZodObject<{
        sms: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        minSeverityForSms: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    }, "strip", z.ZodTypeAny, {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    }, {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "id" | "createdAt" | "updatedAt">, "strip", z.ZodTypeAny, {
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    notificationPreferences: {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    };
    phone?: string | undefined;
}, {
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    notificationPreferences: {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    };
    phone?: string | undefined;
}>;
export declare const UpdateCaregiverSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["family", "nurse", "facility_staff", "admin"]>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notificationPreferences: z.ZodOptional<z.ZodObject<{
        sms: z.ZodDefault<z.ZodBoolean>;
        email: z.ZodDefault<z.ZodBoolean>;
        push: z.ZodDefault<z.ZodBoolean>;
        minSeverityForSms: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    }, "strip", z.ZodTypeAny, {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    }, {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    name?: string | undefined;
    role?: "family" | "nurse" | "facility_staff" | "admin" | undefined;
    phone?: string | undefined;
    notificationPreferences?: {
        push: boolean;
        sms: boolean;
        email: boolean;
        minSeverityForSms: "low" | "medium" | "high" | "critical";
    } | undefined;
}, {
    email?: string | undefined;
    name?: string | undefined;
    role?: "family" | "nurse" | "facility_staff" | "admin" | undefined;
    phone?: string | undefined;
    notificationPreferences?: {
        push?: boolean | undefined;
        sms?: boolean | undefined;
        email?: boolean | undefined;
        minSeverityForSms?: "low" | "medium" | "high" | "critical" | undefined;
    } | undefined;
}>;
/** Minimum length for any caregiver password, shared by create and reset. */
export declare const PasswordSchema: z.ZodString;
/**
 * Creating a login-capable account. Distinct from CreateCaregiverSchema, which
 * deliberately has no password field — a caregiver created through that path
 * exists as a contact but can never sign in.
 */
export declare const CreateCaregiverAccountSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
    role: z.ZodEnum<["family", "nurse", "facility_staff", "admin"]>;
    phone: z.ZodOptional<z.ZodString>;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    password: string;
    phone?: string | undefined;
}, {
    email: string;
    name: string;
    role: "family" | "nurse" | "facility_staff" | "admin";
    password: string;
    phone?: string | undefined;
}>;
export declare const SetPasswordSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
export type CaregiverRole = z.infer<typeof CaregiverRoleSchema>;
export type NotificationPreferences = z.infer<typeof NotificationPreferencesSchema>;
export type Caregiver = z.infer<typeof CaregiverSchema>;
export type CreateCaregiver = z.infer<typeof CreateCaregiverSchema>;
export type UpdateCaregiver = z.infer<typeof UpdateCaregiverSchema>;
export type CreateCaregiverAccount = z.infer<typeof CreateCaregiverAccountSchema>;
//# sourceMappingURL=caregiver.d.ts.map