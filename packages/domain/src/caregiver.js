"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateCaregiverSchema = exports.CreateCaregiverSchema = exports.CaregiverSchema = exports.NotificationPreferencesSchema = exports.CaregiverRoleSchema = void 0;
const zod_1 = require("zod");
exports.CaregiverRoleSchema = zod_1.z.enum([
    "family",
    "nurse",
    "facility_staff",
    "admin",
]);
exports.NotificationPreferencesSchema = zod_1.z.object({
    sms: zod_1.z.boolean().default(false),
    email: zod_1.z.boolean().default(true),
    push: zod_1.z.boolean().default(false),
    minSeverityForSms: zod_1.z.enum(["low", "medium", "high", "critical"]).default("high"),
});
exports.CaregiverSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    role: exports.CaregiverRoleSchema,
    phone: zod_1.z.string().optional(),
    email: zod_1.z.string().email(),
    notificationPreferences: exports.NotificationPreferencesSchema,
    createdAt: zod_1.z.coerce.date(),
    updatedAt: zod_1.z.coerce.date(),
});
exports.CreateCaregiverSchema = exports.CaregiverSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.UpdateCaregiverSchema = exports.CreateCaregiverSchema.partial();
//# sourceMappingURL=caregiver.js.map