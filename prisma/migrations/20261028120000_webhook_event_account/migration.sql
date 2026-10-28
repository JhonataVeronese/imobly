-- Conta (número) que recebeu o webhook, quando conhecida.
ALTER TABLE "webhook_events" ADD COLUMN "provider_account_id" UUID;
