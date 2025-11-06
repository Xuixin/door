import { Injectable } from '@angular/core';
import { TransactionService } from 'src/app/core/Database/collection/txn/facade.service';

export interface RegistryTransaction {
  id: string;
  name: string;
  id_card_base64: string;
  student_number: string;
  register_type: string;
  door_permission: string[];
  status: 'PENDING' | 'IN' | 'OUT';
  client_created_at: string;
}

export interface SubmitResult {
  success: boolean;
  transaction?: RegistryTransaction;
  error?: string;
}

@Injectable({
  providedIn: 'root',
})
export class RegistryService {
  constructor(private readonly transactionService: TransactionService) {}

  async submitRegistration(
    registry: RegistryTransaction,
  ): Promise<SubmitResult> {
    try {
      await this.transactionService.create({
        id: registry.id,
        name: registry.name,
        id_card_base64: registry.id_card_base64,
        student_number: registry.student_number,
        register_type: registry.register_type,
        door_permission: registry.door_permission,
        status: registry.status,
        client_created_at: registry.client_created_at,
      });

      return {
        success: true,
        transaction: registry,
      };
    } catch (error) {
      console.error('Error in submitRegistration:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
