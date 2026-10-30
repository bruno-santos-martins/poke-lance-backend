import { ISellerAuditRepository } from "../../../core/ports/repositories";

export class GetSellerAuditUseCase {
  constructor(private readonly audit: ISellerAuditRepository) {}

  execute(sellerId: string) {
    return this.audit.getForSeller(sellerId);
  }
}
