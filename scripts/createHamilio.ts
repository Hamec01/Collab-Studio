import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash('19910204Nscham', { type: argon2.argon2id });
  try {
    await prisma.user.create({
      data: {
        username: 'Hamilio',
        displayName: 'Hamilio',
        passwordHash,
        role: 'user',
      }
    });
    console.log('Created Hamilio account');
  } catch (error) {
    console.error('Error creating account:', error);
  }
}

main().finally(() => prisma.$disconnect());
