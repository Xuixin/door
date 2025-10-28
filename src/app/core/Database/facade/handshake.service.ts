import { Injectable, Signal, computed, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { RxHandshakeCollection } from '../RxDB.D';
import { HandshakeDocument, HandshakeEvent } from '../../schema';
import { DatabaseService } from '../rxdb.service';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Service facade for handshake operations
 * Provides reactive access to handshake data
 */
@Injectable({
  providedIn: 'root',
})
export class HandshakeService {
  private readonly dbService = inject(DatabaseService);
  private readonly handshakeCollection: RxHandshakeCollection =
    this.dbService.db.handshake;

  // Reactive queries using RxDB
  private readonly allHandshakes$ = this.handshakeCollection
    .find()
    .$.pipe(
      map((docs) => docs.map((doc) => doc.toJSON() as HandshakeDocument)),
    );

  /**
   * Signal containing all handshakes
   */
  public readonly handshakes: Signal<HandshakeDocument[]> = toSignal(
    this.allHandshakes$,
    { initialValue: [] },
  );

  /**
   * Get all handshakes as observable
   */
  getHandshakes$(): Observable<HandshakeDocument[]> {
    return this.allHandshakes$;
  }

  /**
   * Get handshake by ID
   */
  async getHandshakeById(id: string): Promise<HandshakeDocument | null> {
    const doc = await this.handshakeCollection.findOne(id).exec();
    return doc ? (doc.toJSON() as HandshakeDocument) : null;
  }

  /**
   * Get handshakes by transaction ID
   */
  getHandshakesByTxnId$(txnId: string): Observable<HandshakeDocument[]> {
    return this.handshakeCollection
      .find({ selector: { txn_id: txnId } })
      .$.pipe(
        map((docs) => docs.map((doc) => doc.toJSON() as HandshakeDocument)),
      );
  }

  /**
   * Create a new handshake
   */
  async createHandshake(
    handshake: Omit<
      HandshakeDocument,
      'client_created_at' | 'client_updated_at'
    >,
  ): Promise<HandshakeDocument> {
    const now = Date.now().toString();
    const newHandshake: HandshakeDocument = {
      ...handshake,
      client_created_at: now,
      client_updated_at: now,
    };

    const doc = await this.handshakeCollection.insert(newHandshake);
    return doc.toJSON() as HandshakeDocument;
  }

  /**
   * Update handshake
   */
  async updateHandshake(
    id: string,
    updates: Partial<HandshakeDocument>,
  ): Promise<HandshakeDocument> {
    const doc = await this.handshakeCollection.findOne(id).exec();
    if (!doc) {
      throw new Error(`Handshake with id ${id} not found`);
    }

    await doc.update({
      $set: {
        ...updates,
        client_updated_at: Date.now().toString(),
      },
    });

    return doc.toJSON() as HandshakeDocument;
  }

  /**
   * Add event to handshake
   */
  async addEvent(
    id: string,
    event: HandshakeEvent,
  ): Promise<HandshakeDocument> {
    const handshake = await this.getHandshakeById(id);
    if (!handshake) {
      throw new Error(`Handshake with id ${id} not found`);
    }

    const updatedEvents = [...handshake.events, event];

    return this.updateHandshake(id, {
      events: updatedEvents,
    });
  }

  /**
   * Create or get handshake for transaction
   */
  async getOrCreateHandshakeForTransaction(
    txnId: string,
  ): Promise<HandshakeDocument> {
    const existing = await this.handshakeCollection
      .findOne({ selector: { txn_id: txnId } })
      .exec();

    if (existing) {
      return existing.toJSON() as HandshakeDocument;
    }

    // Create new handshake
    const newHandshake: Omit<
      HandshakeDocument,
      'client_created_at' | 'client_updated_at'
    > = {
      id: `handshake-${txnId}-${Date.now()}`,
      txn_id: txnId,
      state: {
        server: false,
        door: false,
      },
      events: [
        {
          type: 'CREATE',
          at: Date.now().toString(),
          actor: 'KIOSK-1', // TODO: Get actual kiosk ID from config
        },
      ],
    };

    return this.createHandshake(newHandshake);
  }

  /**
   * Update handshake state
   */
  async updateState(
    id: string,
    state: Partial<HandshakeDocument['state']>,
  ): Promise<HandshakeDocument> {
    const handshake = await this.getHandshakeById(id);
    if (!handshake) {
      throw new Error(`Handshake with id ${id} not found`);
    }

    return this.updateHandshake(id, {
      state: { ...handshake.state, ...state },
    });
  }
}
