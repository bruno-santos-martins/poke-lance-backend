ALTER TYPE "WalletTransactionType" ADD VALUE 'BID_REFUNDED';

CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "lotId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Audit_lotId_createdAt_idx" ON "Audit"("lotId", "createdAt");
CREATE INDEX "Audit_actorId_createdAt_idx" ON "Audit"("actorId", "createdAt");
CREATE INDEX "Audit_entityType_entityId_createdAt_idx"
    ON "Audit"("entityType", "entityId", "createdAt");

ALTER TABLE "Audit"
    ADD CONSTRAINT "Audit_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Audit"
    ADD CONSTRAINT "Audit_lotId_fkey"
    FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
