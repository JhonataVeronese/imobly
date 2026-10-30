-- Perfis: platform_admin (dono da plataforma, sem tenant) e agent (corretor).
-- Usuários existentes (owner/admin/agent) passam a ser corretores.
CREATE TYPE "UserRole_new" AS ENUM ('platform_admin', 'agent');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "UserRole_new" USING ('agent'::"UserRole_new");
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'agent';

DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

ALTER TABLE "users" ALTER COLUMN "tenant_id" DROP NOT NULL;

-- Administrador da plataforma nunca pertence a um tenant; corretor sempre pertence.
ALTER TABLE "users" ADD CONSTRAINT "users_role_tenant_check"
  CHECK (("role" = 'platform_admin' AND "tenant_id" IS NULL) OR ("role" = 'agent' AND "tenant_id" IS NOT NULL));
