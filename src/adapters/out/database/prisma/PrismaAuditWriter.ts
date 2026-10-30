import { Prisma } from "@prisma/client";
import { AppError } from "../../../../core/domain/errors";
import { NewAuditEvent } from "../../../../core/ports/repositories";

export async function recordAudit(
  transaction: Prisma.TransactionClient,
  event: NewAuditEvent
): Promise<void> {
  const actor = event.actorId && !event.actorName
    ? await transaction.user.findUnique({ where: { id: event.actorId }, select: { name: true } })
    : null;
  if (event.actorId && !event.actorName && !actor) {
    throw new AppError("Não foi possível identificar o responsável pela auditoria.", 500);
  }

  await transaction.audit.create({
    data: {
      actorId: event.actorId,
      actorName: event.actorName ?? actor?.name ?? "Sistema",
      actorRole: event.actorRole,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      lotId: event.lotId ?? null,
      details: event.details
    }
  });
}
