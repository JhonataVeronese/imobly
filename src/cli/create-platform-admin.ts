/**
 * Cria (ou redefine a senha de) um administrador da plataforma.
 *   PLATFORM_ADMIN_PASSWORD='senha-forte' node dist/cli/create-platform-admin.js email@dominio.com "Nome"
 * A senha vem do ambiente para não ficar no histórico do shell nem na lista de processos.
 */
import "../load-env.js";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../http/auth.js";

async function main() {
  const [emailArg, ...nameParts] = process.argv.slice(2);
  const email = emailArg?.trim().toLowerCase();
  const name = nameParts.join(" ").trim() || "Administrador";
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? "";
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Uso: PLATFORM_ADMIN_PASSWORD=... node dist/cli/create-platform-admin.js email@dominio.com "Nome"');
  }
  if (password.length < 12) throw new Error("Defina PLATFORM_ADMIN_PASSWORD com pelo menos 12 caracteres.");

  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing && existing.role !== "platform_admin") {
      throw new Error(`${email} já é corretor de uma imobiliária; use outro e-mail para o administrador.`);
    }
    const passwordHash = await hashPassword(password);
    if (existing) {
      await db.user.update({ where: { id: existing.id }, data: { passwordHash, status: "active", name } });
      console.log(`Senha redefinida: ${email}`);
    } else {
      await db.user.create({ data: { tenantId: null, email, name, passwordHash, role: "platform_admin" } });
      console.log(`Administrador da plataforma criado: ${email}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
