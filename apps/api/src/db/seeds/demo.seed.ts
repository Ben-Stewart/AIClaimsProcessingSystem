import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding demo users...');

  const password = await bcrypt.hash('demo1234', 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'admin@demo.com' },
      update: {},
      create: {
        email: 'admin@demo.com',
        name: 'Admin User',
        role: 'ADMIN',
        passwordHash: password,
      },
    }),
    prisma.user.upsert({
      where: { email: 'adjuster@demo.com' },
      update: {},
      create: {
        email: 'adjuster@demo.com',
        name: 'Jane Adjuster',
        role: 'ADJUSTER',
        passwordHash: password,
      },
    }),
    prisma.user.upsert({
      where: { email: 'supervisor@demo.com' },
      update: {},
      create: {
        email: 'supervisor@demo.com',
        name: 'Bob Supervisor',
        role: 'SUPERVISOR',
        passwordHash: password,
      },
    }),
  ]);

  console.log(`Created ${users.length} staff demo users:`);
  for (const u of users) {
    console.log(`  ${u.email}  (${u.role})`);
  }

  // Demo policy + client user
  const demoPolicy = await prisma.policy.upsert({
    where: { policyNumber: 'POL-DEMO-0001' },
    update: {
      coverageType: 'Employee Benefits Plan',
      coverageLimit: 5000,
      deductible: 0,
      percentCovered: 0.8,
      reasonableAndCustomary: {
        PHYSIOTHERAPY: 120,
        MASSAGE_THERAPY: 100,
        CHIROPRACTIC: 110,
        PSYCHOLOGIST: 150,
        DENTAL_PREVENTIVE: 200,
        DENTAL_RESTORATIVE: 500,
        VISION_CARE: 300,
      },
    },
    create: {
      policyNumber: 'POL-DEMO-0001',
      holderName: 'Alex Client',
      holderEmail: 'client@demo.com',
      coverageType: 'Employee Benefits Plan',
      coverageLimit: 5000,
      deductible: 0,
      percentCovered: 0.8,
      reasonableAndCustomary: {
        PHYSIOTHERAPY: 120,
        MASSAGE_THERAPY: 100,
        CHIROPRACTIC: 110,
        PSYCHOLOGIST: 150,
        DENTAL_PREVENTIVE: 200,
        DENTAL_RESTORATIVE: 500,
        VISION_CARE: 300,
      },
      effectiveDate: new Date('2024-01-01'),
      expiryDate: new Date('2027-01-01'),
    },
  });

  const clientUser = await prisma.user.upsert({
    where: { email: 'client@demo.com' },
    update: {},
    create: {
      email: 'client@demo.com',
      name: 'Alex Client',
      role: 'CLIENT',
      passwordHash: password,
    },
  });

  // Link client to policy if not already linked
  if (!demoPolicy.clientId) {
    await prisma.policy.update({
      where: { id: demoPolicy.id },
      data: { clientId: clientUser.id },
    });
  }

  console.log(`  ${clientUser.email}  (CLIENT) → policy ${demoPolicy.policyNumber}`);
  console.log('Password for all: demo1234');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
