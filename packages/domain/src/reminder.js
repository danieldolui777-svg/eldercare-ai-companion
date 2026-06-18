"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUSES_REQUIRING_ALERT = exports.ConfirmReminderSchema = exports.ReminderEventSchema = exports.ConfirmationSourceSchema = exports.ReminderStatusSchema = void 0;
const zod_1 = require("zod");
exports.ReminderStatusSchema = zod_1.z.enum([
    "scheduled",
    "delivered",
    "confirmed_taken",
    "confirmed_not_taken",
    "unknown",
    "missed",
    "escalated",
]);
exports.ConfirmationSourceSchema = zod_1.z.enum([
    "voice",
    "caregiver",
    "dashboard",
    "manual",
]);
exports.ReminderEventSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    residentId: zod_1.z.string().uuid(),
    medicationScheduleId: zod_1.z.string().uuid(),
    scheduledAt: zod_1.z.coerce.date(),
    deliveredAt: zod_1.z.coerce.date().optional(),
    status: exports.ReminderStatusSchema,
    confirmationSource: exports.ConfirmationSourceSchema.optional(),
    transcriptSnippet: zod_1.z.string().optional(),
    createdAt: zod_1.z.coerce.date(),
    updatedAt: zod_1.z.coerce.date(),
});
exports.ConfirmReminderSchema = zod_1.z.object({
    status: zod_1.z.enum([
        "confirmed_taken",
        "confirmed_not_taken",
        "unknown",
        "missed",
    ]),
    confirmationSource: exports.ConfirmationSourceSchema,
    transcriptSnippet: zod_1.z.string().optional(),
});
exports.STATUSES_REQUIRING_ALERT = new Set([
    "confirmed_not_taken",
    "unknown",
    "missed",
]);
//# sourceMappingURL=reminder.js.map