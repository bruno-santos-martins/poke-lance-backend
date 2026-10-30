import { AppError } from "../../../../core/domain/errors";
import { AuditEntry, ISellerAuditRepository } from "../../../../core/ports/repositories";
import { prisma } from "./client";

function readDetails(value: unknown): Record<string, unknown> {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new AppError("Um registo de auditoria contém detalhes inválidos.", 500);
  }
  return value as Record<string, unknown>;
}

export class PrismaSellerAuditRepository implements ISellerAuditRepository {
  async getForSeller(sellerId: string): Promise<AuditEntry[]> {
    const lots = await prisma.lot.findMany({ where: { sellerId }, select: { id: true } });
    const lotIds = lots.map((lot) => lot.id);

    const events = await prisma.audit.findMany({
      where: { OR: [{ lotId: { in: lotIds } }, { actorId: sellerId }] },
      include: { lot: { select: { title: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    return events.map((event) => ({
      id: event.id,
      actorId: event.actorId,
      actorName: event.actorName,
      actorRole: event.actorRole,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      lotId: event.lotId,
      lotTitle: event.lot?.title ?? null,
      details: readDetails(event.details),
      createdAt: event.createdAt
    }));
  }
}
