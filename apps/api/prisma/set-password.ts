/**
 * Create a caregiver account (or set the password of an existing one).
 *
 * The seed intentionally creates caregivers without a passwordHash, so none of
 * them can log in. This script is the local equivalent of the gated
 * POST /auth/bootstrap-admin endpoint, for when you don't want to set
 * ADMIN_BOOTSTRAP_SECRET and restart the API just to get a dashboard login.
 *
 * Usage:
 *   pnpm --filter @eldercare/api set-password <email> <password> [name] [role]
 *
 * Roles: admin | nurse | family (defaults to admin).
 */
import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

async function main() {
  const [emailArg, password, name, role] = process.argv.slice(2);

  if (!emailArg || !password) {
    console.error(
      "Usage: pnpm --filter @eldercare/api set-password <email> <password> [name] [role]",
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const email = emailArg.toLowerCase().trim();
  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const caregiver = await prisma.caregiver.upsert({
      where: { email },
      update: { passwordHash },
      create: {
        email,
        name: name ?? "Admin",
        role: role ?? "admin",
        passwordHash,
        notificationPreferences: {},
      },
    });
    console.log(`OK - password set for ${email} (id ${caregiver.id}, role ${caregiver.role})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
