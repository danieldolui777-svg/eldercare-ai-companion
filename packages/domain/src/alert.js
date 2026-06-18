"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAlertSchema = exports.AlertSchema = exports.AlertStatusSchema = exports.AlertSeveritySchema = exports.AlertTypeSchema = void 0;
const zod_1 = require("zod");
exports.AlertTypeSchema = zod_1.z.enum([
    "missed_medication",
    "medication_uncertainty",
    "emergency_phrase",
    "wellbeing_concern",
    "device_offline",
    "other",
]);
exports.AlertSeveritySchema = zod_1.z.enum(["low", "medium", "high", "critical"]);
exports.AlertStatusSchema = zod_1.z.enum([
    "created",
    "sent",
    "acknowledged",
    "resolved",
    "failed",
]);
exports.AlertSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    residentId: zod_1.z.string().uuid(),
    type: exports.AlertTypeSchema,
    severity: exports.AlertSeveritySchema,
    status: exports.AlertStatusSchema,
    message: zod_1.z.string().min(1),
    assignedToCaregiverId: zod_1.z.string().uuid().optional(),
    createdAt: zod_1.z.coerce.date(),
    acknowledgedAt: zod_1.z.coerce.date().optional(),
    resolvedAt: zod_1.z.coerce.date().optional(),
});
exports.CreateAlertSchema = exports.AlertSchema.omit({
    id: true,
    status: true,
    createdAt: true,
    acknowledgedAt: true,
    resolvedAt: true,
});
//# sourceMappingURL=alert.js.map