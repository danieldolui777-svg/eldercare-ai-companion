import { z } from "zod";
export declare const ConsentStatusSchema: z.ZodEnum<["pending", "granted", "revoked", "guardian_granted"]>;
export declare const GenderSchema: z.ZodEnum<["female", "male", "other", "unspecified"]>;
export declare const PrivacySettingsSchema: z.ZodObject<{
    storeAudio: z.ZodDefault<z.ZodBoolean>;
    storeTranscripts: z.ZodDefault<z.ZodBoolean>;
    storeMemory: z.ZodDefault<z.ZodBoolean>;
    shareDataWithFamily: z.ZodDefault<z.ZodBoolean>;
    allowAiConversation: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    storeAudio: boolean;
    storeTranscripts: boolean;
    storeMemory: boolean;
    shareDataWithFamily: boolean;
    allowAiConversation: boolean;
}, {
    storeAudio?: boolean | undefined;
    storeTranscripts?: boolean | undefined;
    storeMemory?: boolean | undefined;
    shareDataWithFamily?: boolean | undefined;
    allowAiConversation?: boolean | undefined;
}>;
export declare const ResidentSchema: z.ZodObject<{
    id: z.ZodString;
    firstName: z.ZodString;
    preferredName: z.ZodOptional<z.ZodString>;
    dateOfBirth: z.ZodDate;
    gender: z.ZodOptional<z.ZodEnum<["female", "male", "other", "unspecified"]>>;
    familyContactName: z.ZodOptional<z.ZodString>;
    familyContactRelation: z.ZodOptional<z.ZodString>;
    language: z.ZodDefault<z.ZodString>;
    voicePreferences: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    consentStatus: z.ZodEnum<["pending", "granted", "revoked", "guardian_granted"]>;
    privacySettings: z.ZodObject<{
        storeAudio: z.ZodDefault<z.ZodBoolean>;
        storeTranscripts: z.ZodDefault<z.ZodBoolean>;
        storeMemory: z.ZodDefault<z.ZodBoolean>;
        shareDataWithFamily: z.ZodDefault<z.ZodBoolean>;
        allowAiConversation: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    }, {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    firstName: string;
    dateOfBirth: Date;
    language: string;
    voicePreferences: Record<string, unknown>;
    consentStatus: "pending" | "granted" | "revoked" | "guardian_granted";
    privacySettings: {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    };
    preferredName?: string | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
}, {
    id: string;
    createdAt: Date;
    updatedAt: Date;
    firstName: string;
    dateOfBirth: Date;
    consentStatus: "pending" | "granted" | "revoked" | "guardian_granted";
    privacySettings: {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    };
    preferredName?: string | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
    language?: string | undefined;
    voicePreferences?: Record<string, unknown> | undefined;
}>;
export declare const CreateResidentSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    firstName: z.ZodString;
    preferredName: z.ZodOptional<z.ZodString>;
    dateOfBirth: z.ZodDate;
    gender: z.ZodOptional<z.ZodEnum<["female", "male", "other", "unspecified"]>>;
    familyContactName: z.ZodOptional<z.ZodString>;
    familyContactRelation: z.ZodOptional<z.ZodString>;
    language: z.ZodDefault<z.ZodString>;
    voicePreferences: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    consentStatus: z.ZodEnum<["pending", "granted", "revoked", "guardian_granted"]>;
    privacySettings: z.ZodObject<{
        storeAudio: z.ZodDefault<z.ZodBoolean>;
        storeTranscripts: z.ZodDefault<z.ZodBoolean>;
        storeMemory: z.ZodDefault<z.ZodBoolean>;
        shareDataWithFamily: z.ZodDefault<z.ZodBoolean>;
        allowAiConversation: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    }, {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    }>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "id" | "createdAt" | "updatedAt">, "strip", z.ZodTypeAny, {
    firstName: string;
    dateOfBirth: Date;
    language: string;
    voicePreferences: Record<string, unknown>;
    consentStatus: "pending" | "granted" | "revoked" | "guardian_granted";
    privacySettings: {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    };
    preferredName?: string | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
}, {
    firstName: string;
    dateOfBirth: Date;
    consentStatus: "pending" | "granted" | "revoked" | "guardian_granted";
    privacySettings: {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    };
    preferredName?: string | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
    language?: string | undefined;
    voicePreferences?: Record<string, unknown> | undefined;
}>;
export declare const UpdateResidentSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    preferredName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dateOfBirth: z.ZodOptional<z.ZodDate>;
    gender: z.ZodOptional<z.ZodOptional<z.ZodEnum<["female", "male", "other", "unspecified"]>>>;
    familyContactName: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    familyContactRelation: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    language: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    voicePreferences: z.ZodOptional<z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
    consentStatus: z.ZodOptional<z.ZodEnum<["pending", "granted", "revoked", "guardian_granted"]>>;
    privacySettings: z.ZodOptional<z.ZodObject<{
        storeAudio: z.ZodDefault<z.ZodBoolean>;
        storeTranscripts: z.ZodDefault<z.ZodBoolean>;
        storeMemory: z.ZodDefault<z.ZodBoolean>;
        shareDataWithFamily: z.ZodDefault<z.ZodBoolean>;
        allowAiConversation: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    }, {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    firstName?: string | undefined;
    preferredName?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
    language?: string | undefined;
    voicePreferences?: Record<string, unknown> | undefined;
    consentStatus?: "pending" | "granted" | "revoked" | "guardian_granted" | undefined;
    privacySettings?: {
        storeAudio: boolean;
        storeTranscripts: boolean;
        storeMemory: boolean;
        shareDataWithFamily: boolean;
        allowAiConversation: boolean;
    } | undefined;
}, {
    firstName?: string | undefined;
    preferredName?: string | undefined;
    dateOfBirth?: Date | undefined;
    gender?: "other" | "female" | "male" | "unspecified" | undefined;
    familyContactName?: string | undefined;
    familyContactRelation?: string | undefined;
    language?: string | undefined;
    voicePreferences?: Record<string, unknown> | undefined;
    consentStatus?: "pending" | "granted" | "revoked" | "guardian_granted" | undefined;
    privacySettings?: {
        storeAudio?: boolean | undefined;
        storeTranscripts?: boolean | undefined;
        storeMemory?: boolean | undefined;
        shareDataWithFamily?: boolean | undefined;
        allowAiConversation?: boolean | undefined;
    } | undefined;
}>;
export type ConsentStatus = z.infer<typeof ConsentStatusSchema>;
export type Gender = z.infer<typeof GenderSchema>;
export type PrivacySettings = z.infer<typeof PrivacySettingsSchema>;
export type Resident = z.infer<typeof ResidentSchema>;
export type CreateResident = z.infer<typeof CreateResidentSchema>;
export type UpdateResident = z.infer<typeof UpdateResidentSchema>;
//# sourceMappingURL=resident.d.ts.map