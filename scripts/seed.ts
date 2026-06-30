import { prisma } from "../src/server/db";

async function main() {
  console.log("No password-bearing seed data is created. Use npm run create-admin for the first administrator.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
