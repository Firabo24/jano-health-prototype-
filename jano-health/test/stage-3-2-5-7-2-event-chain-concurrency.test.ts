/**
 * JANO HEALTH — STAGE 3.2.5.7.2 TEST SUITE
 * CONCURRENCY-SAFE DOMAIN EVENT SEQUENCING & HASH-CHAIN INTEGRITY
 *
 * Verifies that concurrent event preparation and commit across all inventory
 * and domain event operations enforce:
 * - Deterministic, non-colliding per-aggregate sequence allocation
 * - Unbroken, non-forked global cryptographic hash-chain continuity
 * - Protection across same-instance, independent EventStore instances, and concurrent workflows
 * - Commit-order-first cryptographic chaining even when preparation order differs
 * - Complete rollback on transaction abort without phantom sequences or broken links
 * - Clean rejection of duplicate event identifiers (immutability violation)
 * - Safe restart recovery from authoritative IndexedDB storage
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { localRepository } from '../src/services/storage/localRepository';
import { EventStore, eventStore } from '../src/services/events/eventStore';
import { inventoryService } from '../src/services/pharmacy/inventoryService';
import {
  InventoryBatch,
  InventoryItem,
  InventoryReceipt,
  InventoryTransaction,
  InventoryTransfer,
  InventoryWastage,
} from '../src/domain/pharmacyTypes';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { DomainEvent } from '../src/domain/persistence';
import {
  computeEventHash,
  findAuthoritativeChainHead,
  sortEventChain,
  verifyEventChain,
} from '../src/domain/eventIntegrity';

async function runStage32572Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.7.2: CONCURRENT EVENT CHAIN INTEGRITY TESTS');
  console.log('========================================================================\n');

  let passed = 0;
  const test = async (name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
      throw err;
    } finally {
      idbEngine.setSimulatedFailure('none');
    }
  };

  const facilityId = 'fac-conc-chain-01';
  const pharmacistActor: ClinicalActorContext = {
    userId: 'usr-pharm-conc-01',
    userName: 'Dr. Almaz Ayana, RPh',
    userRole: 'pharmacist',
    facilityId,
    deviceId: 'dev-conc-01',
  };

  let testSeq = 0;
  async function createTestItemAndBatch(initialQty: number = 100): Promise<{ item: InventoryItem; batch: InventoryBatch }> {
    testSeq++;
    const now = new Date().toISOString();
    const itemId = `inv_item_conc_${Date.now()}_${testSeq}`;
    const batchId = `batch_conc_${Date.now()}_${testSeq}`;

    const item: InventoryItem = {
      id: itemId,
      facilityId,
      medicationDefinitionId: `med_def_conc_${testSeq}`,
      medicationCode: `MED-CONC-${testSeq}`,
      genericName: `Conc Test Medicine ${testSeq}`,
      formulation: 'TABLET',
      strength: '250 mg',
      unit: 'tablets',
      storageRequirements: { type: 'ROOM_TEMPERATURE', notes: 'Dry place' },
      reorderPoint: 20,
      minimumStock: 10,
      maximumStock: 500,
      active: true,
      provenance: {
        source: 'CONC_TEST',
        version: '1.0',
        recordedBy: 'tester',
        recordedAt: now,
        deviceId: 'dev-01',
        facilityId,
        actorId: 'usr-01',
        createdAt: now,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const batch: InventoryBatch = {
      id: batchId,
      inventoryItemId: itemId,
      facilityId,
      batchNumber: `BATCH-CONC-${Date.now()}-${testSeq}`,
      lotNumber: `LOT-C-${testSeq}`,
      expiryDate: '2029-06-30',
      quantityOnHand: initialQty,
      reservedQuantity: 0,
      availableQuantity: initialQty,
      supplierId: 'SUP-CONC-01',
      supplierName: 'Ethiopian Pharmaceuticals Supply Agency',
      receivedAt: now,
      receivedById: 'usr-01',
      receivedByName: 'Test Pharmacist',
      status: 'AVAILABLE',
      provenance: item.provenance,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await localRepository.saveInventoryItem(item);
    await localRepository.saveInventoryBatch(batch);

    if (initialQty > 0) {
      const initTxn: InventoryTransaction = {
        id: `txn_init_${batchId}`,
        facilityId,
        inventoryItemId: itemId,
        batchId,
        transactionType: 'RECEIPT',
        quantity: initialQty,
        unit: 'units',
        referenceType: 'MANUAL_ADJUSTMENT',
        referenceId: `INIT-${batch.batchNumber}`,
        actorId: 'usr-01',
        actorName: 'Test Pharmacist',
        actorRole: 'pharmacist',
        occurredAt: now,
        reason: 'Initial stock setup',
        source: 'TEST',
        version: 1,
        eventId: `evt_init_${batchId}`,
      };
      await localRepository.saveInventoryTransaction(initTxn);
    }

    return { item, batch };
  }

  // --- Group A: Same-Instance Concurrent Event Preparation ---
  console.log('--- Group A: Same-Instance Concurrent Event Preparation ---');

  await test('A.1. Overlapping prepareEvent calls on same aggregate commit with distinct successive sequences', async () => {
    const aggId = `agg_batch_a1_${Date.now()}`;
    const baseEvent = {
      eventType: 'INVENTORY_ADJUSTED' as const,
      aggregateType: 'InventoryBatch' as const,
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { note: 'A.1' },
      metadata: {},
      syncStatus: 'PENDING' as const,
    };

    // Prepare two events concurrently against the same initial state
    const p1 = eventStore.prepareEvent({ ...baseEvent, eventId: `ev_a1_1_${Date.now()}` });
    const p2 = eventStore.prepareEvent({ ...baseEvent, eventId: `ev_a1_2_${Date.now()}` });
    const [draft1, draft2] = await Promise.all([p1, p2]);

    // Commit them concurrently
    await Promise.all([
      idbEngine.executeTransaction(['domainEvents'], async (tx) => {
        await tx.put('domainEvents', draft1);
      }),
      idbEngine.executeTransaction(['domainEvents'], async (tx) => {
        await tx.put('domainEvents', draft2);
      }),
    ]);

    // Fetch directly from authoritative IndexedDB
    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const relevant = all.filter((e) => e.aggregateId === aggId);

    assert.strictEqual(relevant.length, 2, 'Both events committed durably');
    const sorted = relevant.sort((a, b) => a.sequence - b.sequence);
    assert.strictEqual(sorted[0].sequence, 1, 'First event has sequence 1');
    assert.strictEqual(sorted[1].sequence, 2, 'Second event has sequence 2 (no duplicate sequence 1)');
    assert.strictEqual(sorted[1].previousEventHash, sorted[0].eventHash, 'Second event links to first event hash');

    const chainResult = verifyEventChain(sorted);
    assert.strictEqual(chainResult.valid, true, 'Cryptographic hash chain is unbroken');
  });

  await test('A.2. Concurrent generic appendEvent calls serialize cleanly into unbroken chain', async () => {
    const aggId = `agg_append_a2_${Date.now()}`;
    const ev1: DomainEvent = {
      eventId: `ev_a2_1_${Date.now()}`,
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { num: 1 },
      metadata: {},
      syncStatus: 'PENDING',
    };
    const ev2: DomainEvent = {
      eventId: `ev_a2_2_${Date.now()}`,
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { num: 2 },
      metadata: {},
      syncStatus: 'PENDING',
    };

    await Promise.all([eventStore.appendEvent(ev1), eventStore.appendEvent(ev2)]);

    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const relevant = all.filter((e) => e.aggregateId === aggId).sort((a, b) => a.sequence - b.sequence);
    assert.strictEqual(relevant.length, 2);
    assert.strictEqual(relevant[0].sequence, 1);
    assert.strictEqual(relevant[1].sequence, 2);
    assert.strictEqual(relevant[1].previousEventHash, relevant[0].eventHash, 'Second event links to first event hash');
    assert.strictEqual(relevant[1].eventHash, computeEventHash(relevant[1], relevant[0].eventHash));

    const globalEvents = sortEventChain(all);
    assert.strictEqual(verifyEventChain(globalEvents).valid, true, 'Global chain is valid');
  });

  // --- Group B: Independent EventStore Instances ---
  console.log('\n--- Group B: Independent EventStore Instances ---');

  await test('B.1. Two separate EventStore instances observe authoritative chain head from storage', async () => {
    const storeA = eventStore;
    const storeB = new EventStore();
    await storeB.init();

    const aggId = `agg_inst_b1_${Date.now()}`;
    const evA: DomainEvent = {
      eventId: `ev_b1_a_${Date.now()}`,
      eventType: 'INVENTORY_ITEM_CREATED',
      aggregateType: 'InventoryItem',
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { inst: 'A' },
      metadata: {},
      syncStatus: 'PENDING',
    };

    const evB: DomainEvent = {
      eventId: `ev_b1_b_${Date.now()}`,
      eventType: 'INVENTORY_ITEM_CREATED',
      aggregateType: 'InventoryItem',
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 2,
      payload: { inst: 'B' },
      metadata: {},
      syncStatus: 'PENDING',
    };

    // Prepare from storeA and storeB concurrently
    const [prepA, prepB] = await Promise.all([storeA.prepareEvent(evA), storeB.prepareEvent(evB)]);

    // Commit both concurrently
    await Promise.all([
      idbEngine.executeTransaction(['domainEvents'], async (tx) => {
        await tx.put('domainEvents', prepA);
      }),
      idbEngine.executeTransaction(['domainEvents'], async (tx) => {
        await tx.put('domainEvents', prepB);
      }),
    ]);

    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const relevant = all.filter((e) => e.aggregateId === aggId).sort((a, b) => a.sequence - b.sequence);
    assert.strictEqual(relevant.length, 2);
    assert.strictEqual(relevant[0].sequence, 1);
    assert.strictEqual(relevant[1].sequence, 2);
    assert.strictEqual(relevant[1].previousEventHash, relevant[0].eventHash, 'Second event links to first event');
    assert.strictEqual(relevant[1].eventHash, computeEventHash(relevant[1], relevant[0].eventHash));
    const globalEvents = sortEventChain(all);
    assert.strictEqual(verifyEventChain(globalEvents).valid, true, 'Global chain is valid');
  });

  // --- Group C: Concurrent Inventory Adjustments ---
  console.log('\n--- Group C: Concurrent Inventory Adjustments ---');

  await test('C.1. Concurrent adjustStock calls on same batch serialize without lost updates or broken chain', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    // Two concurrent adjustments on the same batch with different physical counts
    const p1 = inventoryService.adjustStock(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        physicalCount: 110,
        reason: 'Cycle count 1',
      },
      pharmacistActor
    );

    const p2 = inventoryService.adjustStock(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        physicalCount: 125,
        reason: 'Cycle count 2',
      },
      pharmacistActor
    );

    const [t1, t2] = await Promise.all([p1, p2]);
    assert(t1 && t2, 'Both adjustments resolved through safe bounded retry');

    // Final batch stock must reflect the latest physical count
    const finalBatch = await idbEngine.get<InventoryBatch>('inventoryBatches', batch.id);
    assert(finalBatch);
    assert.strictEqual(finalBatch.quantityOnHand, 125, 'Final stock is 125');
    assert.strictEqual(finalBatch.version, 3, 'Batch version advanced exactly twice (1 -> 2 -> 3)');

    // Verify events in authoritative store
    const allEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const batchEvents = allEvents.filter((e) => e.aggregateId === batch.id).sort((a, b) => a.sequence - b.sequence);
    assert.strictEqual(batchEvents.length, 2, 'Exactly 2 adjustment events committed');
    assert.strictEqual(batchEvents[0].sequence, 1);
    assert.strictEqual(batchEvents[1].sequence, 2);
    assert.strictEqual(batchEvents[1].previousEventHash, batchEvents[0].eventHash, 'Second batch event links to first');
    assert.strictEqual(batchEvents[1].eventHash, computeEventHash(batchEvents[1], batchEvents[0].eventHash));
    const globalEvents = sortEventChain(allEvents);
    assert.strictEqual(verifyEventChain(globalEvents).valid, true, 'Global chain valid');

    // Ledger consistency
    const consistency = await inventoryService.verifyBatchLedgerConsistency(batch.id);
    assert.strictEqual(consistency.consistent, true, 'Batch ledger remains consistent');
  });

  await test('C.2. Concurrent adjustments on DIFFERENT batches commit in parallel without conflict', async () => {
    const { item: item1, batch: batch1 } = await createTestItemAndBatch(100);
    const { item: item2, batch: batch2 } = await createTestItemAndBatch(200);

    const [t1, t2] = await Promise.all([
      inventoryService.adjustStock(
        { facilityId, inventoryItemId: item1.id, batchId: batch1.id, physicalCount: 95, reason: 'Adj 1' },
        pharmacistActor
      ),
      inventoryService.adjustStock(
        { facilityId, inventoryItemId: item2.id, batchId: batch2.id, physicalCount: 215, reason: 'Adj 2' },
        pharmacistActor
      ),
    ]);

    assert(t1 && t2);
    const b1 = await idbEngine.get<InventoryBatch>('inventoryBatches', batch1.id);
    const b2 = await idbEngine.get<InventoryBatch>('inventoryBatches', batch2.id);
    assert.strictEqual(b1?.quantityOnHand, 95);
    assert.strictEqual(b2?.quantityOnHand, 215);

    const allEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const ev1 = allEvents.find((e) => e.aggregateId === batch1.id && e.eventType === 'INVENTORY_ADJUSTED');
    const ev2 = allEvents.find((e) => e.aggregateId === batch2.id && e.eventType === 'INVENTORY_ADJUSTED');
    assert(ev1 && ev2);
    assert.strictEqual(ev1.sequence, 1, 'Batch 1 adjustment has sequence 1');
    assert.strictEqual(ev2.sequence, 1, 'Batch 2 adjustment has sequence 1 on its own aggregate');
  });

  // --- Group D: Mixed Inventory Workflows ---
  console.log('\n--- Group D: Mixed Inventory Workflows ---');

  await test('D.1. Concurrent receipt and wastage commit distinct aggregate sequences and unbroken global chain', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    const receiptPromise = inventoryService.recordReceipt(
      {
        facilityId,
        supplierName: 'UNICEF Supply Division',
        supplierId: 'UNICEF-01',
        referenceDocument: `MIX-REC-${Date.now()}`,
        items: [
          {
            medicationDefinitionId: 'med_def_amox_500_cap',
            medicationCode: 'WHO-EML-AMOX-500-CAP',
            genericName: 'Amoxicillin 500mg',
            batchNumber: `AMX-REC-${Date.now()}`,
            expiryDate: '2028-11-30',
            quantity: 300,
            unit: 'capsules',
          },
        ],
      },
      pharmacistActor
    );

    const wastagePromise = inventoryService.recordWastage(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        quantity: 10,
        reason: 'DAMAGED',
        notes: 'Mixed concurrency test',
      },
      pharmacistActor
    );

    const [receipt, wastage] = await Promise.all([receiptPromise, wastagePromise]);
    assert(receipt && wastage);

    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const recEv = all.find((e) => e.aggregateId === receipt.id);
    const wstEv = all.find((e) => e.aggregateId === wastage.id);
    assert(recEv && wstEv);

    // Each aggregate starts at sequence 1
    assert.strictEqual(recEv.sequence, 1, 'Receipt aggregate sequence is 1');
    assert.strictEqual(wstEv.sequence, 1, 'Wastage aggregate sequence is 1');

    // Both belong to the global chain
    const globalEvents = sortEventChain(all);
    const chainCheck = verifyEventChain(globalEvents);
    assert.strictEqual(chainCheck.valid, true, 'Global event chain remains valid across mixed workflows');
  });

  await test('D.2. Concurrent adjustment and transfer out commit atomically with valid chain linkages', async () => {
    const { item: item1, batch: batch1 } = await createTestItemAndBatch(100);
    const { item: item2, batch: batch2 } = await createTestItemAndBatch(100);

    const [adjTxn, transfer] = await Promise.all([
      inventoryService.adjustStock(
        { facilityId, inventoryItemId: item1.id, batchId: batch1.id, physicalCount: 105, reason: 'Adj' },
        pharmacistActor
      ),
      inventoryService.transferStock(
        {
          sourceFacilityId: facilityId,
          destinationFacilityId: 'fac-dest-chain',
          inventoryItemId: item2.id,
          batchId: batch2.id,
          quantity: 20,
        },
        pharmacistActor
      ),
    ]);

    assert(adjTxn && transfer);
    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const sorted = sortEventChain(all);
    assert.strictEqual(verifyEventChain(sorted).valid, true, 'Global chain valid after mixed adjustment + transfer');
  });

  // --- Group E: Commit Order Different from Preparation Order ---
  console.log('\n--- Group E: Commit Order Different from Preparation Order ---');

  await test('E.1. Events committing out of preparation order establish correct predecessor links in commit order', async () => {
    const aggId = `agg_order_e1_${Date.now()}`;
    const baseEvent = {
      eventType: 'INVENTORY_ADJUSTED' as const,
      aggregateType: 'InventoryBatch' as const,
      aggregateId: aggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: {},
      metadata: {},
      syncStatus: 'PENDING' as const,
    };

    // Prepare Event A FIRST, then Event B
    const evA = await eventStore.prepareEvent({ ...baseEvent, eventId: `ev_e1_A_${Date.now()}` });
    const evB = await eventStore.prepareEvent({ ...baseEvent, eventId: `ev_e1_B_${Date.now()}` });

    // DELIBERATELY commit Event B FIRST, then Event A
    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', evB);
    });
    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', evA);
    });

    const all = await idbEngine.getAll<DomainEvent>('domainEvents');
    const committedB = all.find((e) => e.eventId === evB.eventId)!;
    const committedA = all.find((e) => e.eventId === evA.eventId)!;

    // B committed first -> sequence 1
    // A committed second -> sequence 2, linking to B
    assert.strictEqual(committedB.sequence, 1, 'Event B committed first, receives sequence 1');
    assert.strictEqual(committedA.sequence, 2, 'Event A committed second, receives sequence 2');
    assert.strictEqual(committedA.previousEventHash, committedB.eventHash, 'Event A links to Event B');
    assert.strictEqual(committedA.eventHash, computeEventHash(committedA, committedB.eventHash));

    const globalEvents = sortEventChain(all);
    assert.strictEqual(verifyEventChain(globalEvents).valid, true, 'Commit-order chain verified');
  });

  // --- Group F: Transaction Failure Interleaving ---
  console.log('\n--- Group F: Transaction Failure Interleaving ---');

  await test('F.1. Aborted transaction leaves zero committed events, sequence gaps, or stale cached heads', async () => {
    const { item, batch } = await createTestItemAndBatch(100);

    // Count events before
    const beforeEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const headBefore = findAuthoritativeChainHead(beforeEvents);

    // Force transaction abort
    idbEngine.setSimulatedFailure('transaction_abort');
    await assert.rejects(async () => {
      await inventoryService.recordWastage(
        {
          facilityId,
          inventoryItemId: item.id,
          batchId: batch.id,
          quantity: 20,
          reason: 'DAMAGED',
          notes: 'TEST_ABORT',
        },
        pharmacistActor
      );
    });
    idbEngine.setSimulatedFailure('none');

    // Verify zero events committed from aborted transaction
    const afterAbortEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert.strictEqual(afterAbortEvents.length, beforeEvents.length, 'No phantom events stored');

    // Next transaction succeeds and links directly to headBefore
    const successfulAdj = await inventoryService.adjustStock(
      {
        facilityId,
        inventoryItemId: item.id,
        batchId: batch.id,
        physicalCount: 110,
        reason: 'Recovery after abort',
      },
      pharmacistActor
    );
    assert(successfulAdj);

    const finalEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const adjEvent = finalEvents.find((e) => e.aggregateId === batch.id && e.eventType === 'INVENTORY_ADJUSTED')!;
    assert(adjEvent);
    assert.strictEqual(adjEvent.sequence, 1, 'Sequence starts at 1 (no phantom gap)');
    assert.strictEqual(
      adjEvent.previousEventHash,
      headBefore ? headBefore.eventHash : null,
      'Predecessor links to true prior head'
    );
  });

  // --- Group G: Duplicate Event Identifiers ---
  console.log('\n--- Group G: Duplicate Event Identifiers ---');

  await test('G.1. Duplicate eventId in transaction is strictly rejected and aborts transaction', async () => {
    const dupEventId = `ev_dup_${Date.now()}`;
    const baseEvent: DomainEvent = {
      eventId: dupEventId,
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'agg_dup_g1',
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: {},
      metadata: {},
      syncStatus: 'PENDING',
    };

    // First commit succeeds
    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', baseEvent);
    });

    // Second commit with same eventId must be rejected
    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
          await tx.put('domainEvents', { ...baseEvent, payload: { tampered: true } });
        });
      },
      (err: any) => {
        assert(
          err.message.includes('Duplicate eventId') || err.message.includes('Immutability violation'),
          `Error must indicate duplicate eventId: ${err.message}`
        );
        return true;
      }
    );
  });

  // --- Group H: Restart and Recovery ---
  console.log('\n--- Group H: Restart and Recovery ---');

  await test('H.1. Fresh EventStore instance recovers authoritative head and appends seamlessly', async () => {
    const storedBefore = await idbEngine.getAll<DomainEvent>('domainEvents');
    const expectedHead = findAuthoritativeChainHead(storedBefore);

    // Create a new uninitialized EventStore instance
    const freshStore = new EventStore();
    await freshStore.init(true);

    const recoveredLastEvent = await freshStore.getLastEvent();
    assert.strictEqual(
      recoveredLastEvent ? recoveredLastEvent.eventHash : null,
      expectedHead ? expectedHead.eventHash : null,
      'Recovered head matches authoritative storage tip'
    );

    // Append new event through freshStore
    const newAggId = `agg_fresh_h1_${Date.now()}`;
    const newEvent: DomainEvent = {
      eventId: `ev_fresh_h1_${Date.now()}`,
      eventType: 'INVENTORY_ITEM_CREATED',
      aggregateType: 'InventoryItem',
      aggregateId: newAggId,
      facilityId,
      actorId: pharmacistActor.userId,
      deviceId: pharmacistActor.deviceId,
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { fresh: true },
      metadata: {},
      syncStatus: 'PENDING',
    };

    await freshStore.appendEvent(newEvent);

    const allEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    const committed = allEvents.find((e) => e.eventId === newEvent.eventId)!;
    assert(committed);
    assert.strictEqual(committed.sequence, 1);
    assert.strictEqual(
      committed.previousEventHash,
      expectedHead ? expectedHead.eventHash : null,
      'New event points to recovered durable head'
    );

    const fullChain = sortEventChain(allEvents);
    assert.strictEqual(verifyEventChain(fullChain).valid, true, 'Full chain verified after recovery append');
  });

  // --- Group I: Authoritative IndexedDB Direct Integrity Verification ---
  console.log('\n--- Group I: Authoritative IndexedDB Direct Integrity Verification ---');

  await test('I.1. Authoritative IndexedDB domainEvents store passes comprehensive cryptographic validation', async () => {
    const allEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert(allEvents.length >= 10, 'Multiple events exist from preceding tests');

    // 1. Unique event identifiers
    const idSet = new Set<string>();
    for (const ev of allEvents) {
      assert(!idSet.has(ev.eventId), `Duplicate eventId found: ${ev.eventId}`);
      idSet.add(ev.eventId);
    }

    // 2. Monotonic per-aggregate sequences
    const byAggregate = new Map<string, DomainEvent[]>();
    for (const ev of allEvents) {
      const key = `${ev.aggregateType}:${ev.aggregateId}`;
      if (!byAggregate.has(key)) byAggregate.set(key, []);
      byAggregate.get(key)!.push(ev);
    }

    for (const [key, aggEvents] of byAggregate.entries()) {
      const sortedAgg = aggEvents.sort((a, b) => a.sequence - b.sequence);
      for (let i = 0; i < sortedAgg.length; i++) {
        assert.strictEqual(
          sortedAgg[i].sequence,
          i + 1,
          `Aggregate ${key} has non-monotonic or duplicate sequence at index ${i}`
        );
      }
    }

    // 3. Full global hash chain verification
    const sortedGlobal = sortEventChain(allEvents);
    const verification = verifyEventChain(sortedGlobal);
    assert.strictEqual(verification.valid, true, `Global event chain invalid: ${verification.reason}`);

    // 4. Verify canonical recomputed hashes match stored eventHash byte-for-byte
    for (let i = 0; i < sortedGlobal.length; i++) {
      const ev = sortedGlobal[i];
      const prevHash = i === 0 ? null : sortedGlobal[i - 1].eventHash || null;
      const recomputed = computeEventHash(ev, prevHash);
      assert.strictEqual(
        ev.eventHash,
        recomputed,
        `Event hash mismatch on ${ev.eventId}: recorded ${ev.eventHash}, computed ${recomputed}`
      );
    }
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/${passed} STAGE 3.2.5.7.2 CONCURRENT EVENT INTEGRITY TESTS PASSED PERFECTLY`);
  console.log('========================================================================\n');
}

runStage32572Tests().catch((err) => {
  console.error('\nStage 3.2.5.7.2 test execution failed:', err);
  process.exit(1);
});
