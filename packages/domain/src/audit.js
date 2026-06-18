"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAuditLogSchema = exports.AuditLogSchema = exports.AuditActorTypeSchema = void 0;
const zod_1 = require("zod");
exports.AuditActorTypeSchema = zod_1.z.enum([
    "resident",
    "caregiver",
    "system",
    "ai",
]);
exports.AuditLogSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    actorType: exports.AuditActorTypeSchema,
    actorId: zod_1.z.string().optional(),
    action: zod_1.z.string().min(1),
    entityType: zod_1.z.string().min(1),
    entityId: zod_1.z.string().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).default({}),
    createdAt: zod_1.z.coerce.date(),
});
exports.CreateAuditLogSchema = exports.AuditLogSchema.omit({
    id: true,
    createdAt: true,
});
//# sourceMappingURL=audit.js.map