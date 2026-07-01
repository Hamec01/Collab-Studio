import readline from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function promptRequired(rl: ReturnType<typeof createInterface>, label: string): Promise<string> {
  const value = (await rl.question(label)).trim();
  if (!value) throw new Error(`${label.trim()} is required`);
  return value;
}

async function promptHidden(label: string): Promise<string> {
  if (!input.isTTY || !output.isTTY) {
    throw new Error("Password input requires an interactive TTY");
  }

  return new Promise((resolve, reject) => {
    const chars: string[] = [];
    const onKeypress = (_str: string, key: readline.Key) => {
      if (key.name === "return") {
        cleanup();
        output.write("\n");
        resolve(chars.join(""));
        return;
      }

      if (key.name === "backspace") {
        chars.pop();
        return;
      }

      if (key.ctrl && key.name === "c") {
        cleanup();
        output.write("\n");
        reject(new Error("Interrupted"));
        return;
      }

      if (typeof key.sequence === "string" && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        chars.push(key.sequence);
      }
    };

    const cleanup = () => {
      input.setRawMode(false);
      input.off("keypress", onKeypress);
    };

    output.write(label);
    readline.emitKeypressEvents(input);
    input.setRawMode(true);
    input.on("keypress", onKeypress);
  });
}

function normalizeUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-zA-Z0-9._-]{3,40}$/.test(normalized)) {
    throw new Error("Username must be 3-40 characters and contain only letters, numbers, dots, underscores, and hyphens");
  }
  return normalized;
}

function normalizeEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Email must be valid");
  }
  return normalized;
}

function assertPasswordPolicy(password: string) {
  if (password.length < 12) throw new Error("Password must be at least 12 characters long");
  if (password.length > 128) throw new Error("Password must be at most 128 characters long");
}

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (existingAdmin) {
    throw new Error("An administrator already exists. Refusing to create another one from this bootstrap script.");
  }

  const rl = createInterface({ input, output });
  try {
    const username = normalizeUsername(await promptRequired(rl, "Username: "));
    const email = normalizeEmail(await rl.question("Email (optional): "));
    const displayName = (await promptRequired(rl, "Display name: ")).trim();
    const password = await promptHidden("Password: ");
    const confirmPassword = await promptHidden("Confirm password: ");

    assertPasswordPolicy(password);
    if (password !== confirmPassword) throw new Error("Passwords do not match");

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, ...(email ? [{ email }] : [])],
      },
      select: { id: true },
    });
    if (existingUser) throw new Error("Username or email is already in use");

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const user = await prisma.user.create({
      data: {
        username,
        email,
        displayName,
        passwordHash,
        role: "admin",
      },
      select: { id: true, username: true, email: true, displayName: true, role: true },
    });

    console.log(`Created admin user ${user.username} (${user.id})`);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new Error("Username or email is already in use");
    }
    throw error;
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : "Failed to create administrator");
  await prisma.$disconnect();
  process.exit(1);
});
