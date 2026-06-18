import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const caregiver = await prisma.caregiver.upsert({
    where: { email: "marie.dupont@ehpad-leslilas.fr" },
    update: {},
    create: {
      name: "Marie Dupont",
      role: "nurse",
      email: "marie.dupont@ehpad-leslilas.fr",
      phone: "+33612345678",
      notificationPreferences: {
        sms: true,
        email: true,
        push: false,
        minSeverityForSms: "high",
      },
    },
  });

  const familyCaregiver = await prisma.caregiver.upsert({
    where: { email: "pierre.martin@gmail.com" },
    update: {},
    create: {
      name: "Pierre Martin",
      role: "family",
      email: "pierre.martin@gmail.com",
      notificationPreferences: {
        sms: false,
        email: true,
        push: true,
        minSeverityForSms: "critical",
      },
    },
  });

  const resident1 = await prisma.resident.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      firstName: "Jeanne",
      preferredName: "Mémé Jeanne",
      dateOfBirth: new Date("1938-03-15"),
      language: "fr",
      consentStatus: "granted",
      privacySettings: {
        storeAudio: false,
        storeTranscripts: false,
        shareDataWithFamily: true,
        allowAiConversation: true,
      },
    },
  });

  const resident2 = await prisma.resident.upsert({
    where: { id: "00000000-0000-0000-0000-000000000002" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000002",
      firstName: "Robert",
      preferredName: "Robert",
      dateOfBirth: new Date("1935-07-22"),
      language: "fr",
      consentStatus: "guardian_granted",
      privacySettings: {
        storeAudio: false,
        storeTranscripts: false,
        shareDataWithFamily: true,
        allowAiConversation: false,
      },
    },
  });

  const med1 = await prisma.medication.create({
    data: {
      residentId: resident1.id,
      name: "Doliprane",
      dosageLabel: "500 mg",
      instructionsLabel: "À prendre avec un verre d'eau",
      prescribingSourceLabel: "Dr. Bernard - ordonnance du 2026-01-10",
      active: true,
    },
  });

  const med2 = await prisma.medication.create({
    data: {
      residentId: resident1.id,
      name: "Amlodipine",
      dosageLabel: "5 mg",
      instructionsLabel: "Le matin à jeun",
      prescribingSourceLabel: "Dr. Bernard - ordonnance du 2026-01-10",
      active: true,
    },
  });

  const med3 = await prisma.medication.create({
    data: {
      residentId: resident2.id,
      name: "Metformine",
      dosageLabel: "500 mg",
      instructionsLabel: "Pendant les repas",
      prescribingSourceLabel: "Dr. Leclerc - ordonnance du 2026-02-05",
      active: true,
    },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  await prisma.medicationSchedule.create({
    data: {
      medicationId: med1.id,
      residentId: resident1.id,
      timeOfDay: "08:00",
      recurrenceRule: "FREQ=DAILY",
      startDate: today,
      active: true,
    },
  });

  await prisma.medicationSchedule.create({
    data: {
      medicationId: med2.id,
      residentId: resident1.id,
      timeOfDay: "08:00",
      recurrenceRule: "FREQ=DAILY",
      startDate: today,
      active: true,
    },
  });

  await prisma.medicationSchedule.create({
    data: {
      medicationId: med3.id,
      residentId: resident2.id,
      timeOfDay: "12:00",
      recurrenceRule: "FREQ=DAILY",
      startDate: today,
      active: true,
    },
  });

  console.log("Seed complete.");
  console.log(`Caregivers: ${caregiver.name}, ${familyCaregiver.name}`);
  console.log(`Residents: ${resident1.firstName}, ${resident2.firstName}`);
  console.log(`Medications: ${med1.name}, ${med2.name}, ${med3.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
