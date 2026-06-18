"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateResidentSchema = exports.CreateResidentSchema = exports.ResidentSchema = exports.PrivacySettingsSchema = exports.ConsentStatusSchema = void 0;
const zod_1 = require("zod");
exports.ConsentStatusSchema = zod_1.z.enum([
    "pending",
    "granted",
    "revoked",
    "guardian_granted",
]);
exports.PrivacySettingsSchema = zod_1.z.object({
    storeAudio: zod_1.z.boolean().default(false),
    storeTranscripts: zod_1.z.boolean().default(false),
    shareDataWithFamily: zod_1.z.boolean().default(true),
    allowAiConversation: zod_1.z.boolean().default(true),
});
exports.ResidentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    firstName: zod_1.z.string().min(1),
    preferredName: zod_1.z.string().optional(),
    dateOfBirth: zod_1.z.coerce.date(),
    language: zod_1.z.string().default("fr"),
    voicePreferences: zod_1.z.record(zod_1.z.unknown()).default({}),
    consentStatus: exports.ConsentStatusSchema,
    privacySettings: exports.PrivacySettingsSchema,
    createdAt: zod_1.z.coerce.date(),
    updatedAt: zod_1.z.coerce.date(),
});
exports.CreateResidentSchema = exports.ResidentSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.UpdateResidentSchema = exports.CreateResidentSchema.partial();
//# sourceMappingURL=resident.js.map