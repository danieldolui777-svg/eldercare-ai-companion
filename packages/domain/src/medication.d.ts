import { z } from "zod";
export declare const MedicationSchema: z.ZodObject<{
    id: z.ZodString;
    residentId: z.ZodString;
    name: z.ZodString;
    dosageLabel: z.ZodString;
    instructionsLabel: z.ZodString;
    prescribingSourceLabel: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    residentId: string;
    createdAt: Date;
    name: string;
    updatedAt: Date;
    dosageLabel: string;
    instructionsLabel: string;
    prescribingSourceLabel: string;
    active: boolean;
}, {
    id: string;
    residentId: string;
    createdAt: Date;
    name: string;
    updatedAt: Date;
    dosageLabel: string;
    instructionsLabel: string;
    prescribingSourceLabel: string;
    active?: boolean | undefined;
}>;
export declare const CreateMedicationSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    residentId: z.ZodString;
    name: z.ZodString;
    dosageLabel: z.ZodString;
    instructionsLabel: z.ZodString;
    prescribingSourceLabel: z.ZodString;
    active: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "id" | "createdAt" | "updatedAt">, "strip", z.ZodTypeAny, {
    residentId: string;
    name: string;
    dosageLabel: string;
    instructionsLabel: string;
    prescribingSourceLabel: string;
    active: boolean;
}, {
    residentId: string;
    name: string;
    dosageLabel: string;
    instructionsLabel: string;
    prescribingSourceLabel: string;
    active?: boolean | undefined;
}>;
export declare const UpdateMedicationSchema: z.ZodObject<{
    residentId: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    dosageLabel: z.ZodOptional<z.ZodString>;
    instructionsLabel: z.ZodOptional<z.ZodString>;
    prescribingSourceLabel: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    residentId?: string | undefined;
    name?: string | undefined;
    dosageLabel?: string | undefined;
    instructionsLabel?: string | undefined;
    prescribingSourceLabel?: string | undefined;
    active?: boolean | undefined;
}, {
    residentId?: string | undefined;
    name?: string | undefined;
    dosageLabel?: string | undefined;
    instructionsLabel?: string | undefined;
    prescribingSourceLabel?: string | undefined;
    active?: boolean | undefined;
}>;
export declare const MedicationScheduleSchema: z.ZodObject<{
    id: z.ZodString;
    medicationId: z.ZodString;
    residentId: z.ZodString;
    timeOfDay: z.ZodString;
    recurrenceRule: z.ZodString;
    startDate: z.ZodDate;
    endDate: z.ZodOptional<z.ZodDate>;
    active: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    id: string;
    residentId: string;
    createdAt: Date;
    updatedAt: Date;
    active: boolean;
    medicationId: string;
    timeOfDay: string;
    recurrenceRule: string;
    startDate: Date;
    endDate?: Date | undefined;
}, {
    id: string;
    residentId: string;
    createdAt: Date;
    updatedAt: Date;
    medicationId: string;
    timeOfDay: string;
    recurrenceRule: string;
    startDate: Date;
    active?: boolean | undefined;
    endDate?: Date | undefined;
}>;
export declare const CreateMedicationScheduleSchema: z.ZodObject<Omit<{
    id: z.ZodString;
    medicationId: z.ZodString;
    residentId: z.ZodString;
    timeOfDay: z.ZodString;
    recurrenceRule: z.ZodString;
    startDate: z.ZodDate;
    endDate: z.ZodOptional<z.ZodDate>;
    active: z.ZodDefault<z.ZodBoolean>;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "id" | "createdAt" | "updatedAt">, "strip", z.ZodTypeAny, {
    residentId: string;
    active: boolean;
    medicationId: string;
    timeOfDay: string;
    recurrenceRule: string;
    startDate: Date;
    endDate?: Date | undefined;
}, {
    residentId: string;
    medicationId: string;
    timeOfDay: string;
    recurrenceRule: string;
    startDate: Date;
    active?: boolean | undefined;
    endDate?: Date | undefined;
}>;
export declare const UpdateMedicationScheduleSchema: z.ZodObject<{
    residentId: z.ZodOptional<z.ZodString>;
    active: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    medicationId: z.ZodOptional<z.ZodString>;
    timeOfDay: z.ZodOptional<z.ZodString>;
    recurrenceRule: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodDate>;
    endDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    residentId?: string | undefined;
    active?: boolean | undefined;
    medicationId?: string | undefined;
    timeOfDay?: string | undefined;
    recurrenceRule?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
}, {
    residentId?: string | undefined;
    active?: boolean | undefined;
    medicationId?: string | undefined;
    timeOfDay?: string | undefined;
    recurrenceRule?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
}>;
export type Medication = z.infer<typeof MedicationSchema>;
export type CreateMedication = z.infer<typeof CreateMedicationSchema>;
export type UpdateMedication = z.infer<typeof UpdateMedicationSchema>;
export type MedicationSchedule = z.infer<typeof MedicationScheduleSchema>;
export type CreateMedicationSchedule = z.infer<typeof CreateMedicationScheduleSchema>;
export type UpdateMedicationSchedule = z.infer<typeof UpdateMedicationScheduleSchema>;
//# sourceMappingURL=medication.d.ts.map