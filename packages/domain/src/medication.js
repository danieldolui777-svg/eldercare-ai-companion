"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateMedicationScheduleSchema = exports.CreateMedicationScheduleSchema = exports.MedicationScheduleSchema = exports.UpdateMedicationSchema = exports.CreateMedicationSchema = exports.MedicationSchema = void 0;
const zod_1 = require("zod");
exports.MedicationSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    residentId: zod_1.z.string().uuid(),
    name: zod_1.z.string().min(1),
    // Display-only label. The AI must never read or modify dosage programmatically.
    dosageLabel: zod_1.z.string(),
    instructionsLabel: zod_1.z.string(),
    prescribingSourceLabel: zod_1.z.string(),
    active: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.coerce.date(),
    updatedAt: zod_1.z.coerce.date(),
});
exports.CreateMedicationSchema = exports.MedicationSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.UpdateMedicationSchema = exports.CreateMedicationSchema.partial();
exports.MedicationScheduleSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    medicationId: zod_1.z.string().uuid(),
    residentId: zod_1.z.string().uuid(),
    timeOfDay: zod_1.z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
    recurrenceRule: zod_1.z.string(),
    startDate: zod_1.z.coerce.date(),
    endDate: zod_1.z.coerce.date().optional(),
    active: zod_1.z.boolean().default(true),
    createdAt: zod_1.z.coerce.date(),
    updatedAt: zod_1.z.coerce.date(),
});
exports.CreateMedicationScheduleSchema = exports.MedicationScheduleSchema.omit({
    id: true,
    createdAt: true,
    updatedAt: true,
});
exports.UpdateMedicationScheduleSchema = exports.CreateMedicationScheduleSchema.partial();
//# sourceMappingURL=medication.js.map