/**
 * JANO HEALTH — STAGE 3.2.5.7.2.3 TEST SUITE
 * FAIL-CLOSED GLOBAL EVENT-CHAIN VALIDATION & SAFE APPEND BEHAVIOR
 *
 * Verifies that domain event sequencing, hash-chain integrity, and transaction boundaries
 * strictly fail closed on all invalid, ambiguous, or forked ledger states:
 *
 * - Scenario A: Empty ledger returns null head and allows first event commit
 * - Scenario B: Single valid chain returns correct terminal head and allows safe append
 * - Scenario C: Multiple genesis roots fails closed across all access paths
 * - Scenario D: Forked successor (competing successors) fails closed across all access paths
 * - Scenario E: Multiple unreferenced heads fails closed without timestamp tiebreak
 * - Scenario F: Dangling predecessor reference fails closed
 * - Scenario G: Disconnected cycle or unreachable events fails closed
 * - Scenario H: Tampered payload / hash mismatch fails closed
 * - Scenario I: Duplicate eventId or eventHash fails closed
 * - Scenario J: Atomic transaction abort — business mutations roll back completely on chain failure
 */

import assert from 'node:assert';
import { idbEngine } from '../src/services/storage/indexedDbEngine';
import { EventStore, eventStore } from '../src/services/events/eventStore';
import {
  computeEventHash,
  findAuthoritativeChainHead,
  sortEventChain,
  validateEventChainIntegrity,
  deepFreeze,
} from '../src/domain/eventIntegrity';
import { DomainEvent } from '../src/domain/persistence';
import { InventoryBatch, InventoryTransaction } from '../src/domain/pharmacyTypes';

async function runStage325723Tests() {
  console.log('\n========================================================================');
  console.log('JANO HEALTH — STAGE 3.2.5.7.2.3: FAIL-CLOSED CHAIN INTEGRITY TESTS');
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

  const facilityId = 'fac-failclose-01';

  // Helper to create cryptographically valid domain events
  function makeEvent(params: {
    eventId: string;
    eventType?: any;
    aggregateType?: any;
    aggregateId: string;
    facilityId?: string;
    actorId?: string;
    deviceId?: string;
    sequence?: number;
    previousEventHash?: string | null;
    timestamp?: string;
    payload?: any;
    metadata?: any;
    clientCreatedAt?: string;
    clientUpdatedAt?: string;
    hashVersion?: number;
  }): DomainEvent {
    const targetHashVersion = params.hashVersion ?? 2;
    const ev: DomainEvent = {
      eventId: params.eventId,
      eventType: params.eventType || 'INVENTORY_ADJUSTED',
      aggregateType: params.aggregateType || 'InventoryBatch',
      aggregateId: params.aggregateId,
      facilityId: params.facilityId || facilityId,
      actorId: params.actorId || 'usr-audit-01',
      deviceId: params.deviceId || 'dev-audit-01',
      timestamp: params.timestamp || new Date().toISOString(),
      sequence: params.sequence ?? 1,
      version: 1,
      payload: params.payload ?? { notes: 'test' },
      metadata: params.metadata ?? {},
      syncStatus: 'PENDING' as const,
      previousEventHash: params.previousEventHash ?? null,
      hashVersion: targetHashVersion,
      clientCreatedAt: params.clientCreatedAt,
      clientUpdatedAt: params.clientUpdatedAt,
    };

    const hash = computeEventHash(ev, params.previousEventHash ?? null);
    return deepFreeze({
      ...ev,
      eventHash: hash,
    });
  }

  // --- Scenario A: Empty ledger ---
  await test('Scenario A: Empty ledger returns null head, empty sort, and allows first event commit', async () => {
    await idbEngine.clearStore('domainEvents');
    eventStore.clear();

    const emptyValidation = validateEventChainIntegrity([]);
    assert.strictEqual(emptyValidation.valid, true, 'Empty ledger is valid starting state');
    assert.strictEqual(emptyValidation.head, null, 'Empty ledger head is null');
    assert.deepStrictEqual(emptyValidation.sortedEvents, [], 'Empty ledger sortedEvents is []');

    assert.strictEqual(findAuthoritativeChainHead([]), null, 'findAuthoritativeChainHead returns null for empty');
    assert.deepStrictEqual(sortEventChain([]), [], 'sortEventChain returns [] for empty');

    await eventStore.init(true);
    const lastEvent = await eventStore.getLastEvent();
    assert.strictEqual(lastEvent, null, 'EventStore.getLastEvent() returns null on empty ledger');

    // Commit genesis event through executeTransaction
    const genesisEvent: DomainEvent = {
      eventId: 'ev_genesis_a',
      eventType: 'INVENTORY_RECEIVED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_scen_a',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 1,
      version: 1,
      payload: { quantity: 100 },
      metadata: {},
      syncStatus: 'PENDING',
    };

    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', genesisEvent);
    });

    const stored = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert.strictEqual(stored.length, 1, 'Genesis event committed');
    assert.strictEqual(stored[0].sequence, 1, 'Genesis event has sequence 1');
    assert.strictEqual(stored[0].previousEventHash, null, 'Genesis event has null predecessor');
    assert.ok(stored[0].eventHash, 'Genesis event has SHA-256 eventHash');

    const expectedGenesisHash = computeEventHash(stored[0], null);
    assert.strictEqual(stored[0].eventHash, expectedGenesisHash, 'Genesis hash matches canonical preimage');

    const head = findAuthoritativeChainHead(stored);
    assert.strictEqual(head?.eventId, 'ev_genesis_a', 'Genesis event is authoritative head');
  });

  // --- Scenario B: Single valid chain ---
  await test('Scenario B: Single valid chain returns correct terminal head and allows safe append', async () => {
    await idbEngine.clearStore('domainEvents');
    eventStore.clear();

    const ev1 = makeEvent({
      eventId: 'ev_b_1',
      aggregateId: 'batch_b_1',
      sequence: 1,
      previousEventHash: null,
    });
    const ev2 = makeEvent({
      eventId: 'ev_b_2',
      aggregateId: 'batch_b_2',
      sequence: 1,
      previousEventHash: ev1.eventHash,
    });
    const ev3 = makeEvent({
      eventId: 'ev_b_3',
      aggregateId: 'batch_b_1',
      sequence: 2,
      previousEventHash: ev2.eventHash,
    });

    // Populate valid chain in storage directly
    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', ev1);
      await tx.put('domainEvents', ev2);
      await tx.put('domainEvents', ev3);
    });

    const stored = await idbEngine.getAll<DomainEvent>('domainEvents');
    const validation = validateEventChainIntegrity(stored);
    assert.strictEqual(validation.valid, true, 'Stored chain is valid');
    assert.strictEqual(validation.head?.eventId, 'ev_b_3', 'Head is ev_b_3');
    assert.strictEqual(findAuthoritativeChainHead(stored)?.eventId, 'ev_b_3', 'findAuthoritativeChainHead returns ev_b_3');

    const sorted = sortEventChain(stored);
    assert.deepStrictEqual(sorted.map((e) => e.eventId), ['ev_b_1', 'ev_b_2', 'ev_b_3']);

    // EventStore.init aligns perfectly
    await eventStore.init(true);
    assert.strictEqual((await eventStore.getLastEvent())?.eventId, 'ev_b_3');

    // Safe append of ev4 via executeTransaction
    const ev4Draft: DomainEvent = {
      eventId: 'ev_b_4',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_b_1',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { diff: -5 },
      metadata: {},
      syncStatus: 'PENDING',
    };

    await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
      await tx.put('domainEvents', ev4Draft);
    });

    const updated = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert.strictEqual(updated.length, 4);
    const ev4Final = updated.find((e) => e.eventId === 'ev_b_4');
    assert.ok(ev4Final);
    assert.strictEqual(ev4Final.previousEventHash, ev3.eventHash, 'ev4 linked to ev3');
    assert.strictEqual(ev4Final.sequence, 3, 'ev4 has sequence 3 on batch_b_1');
    assert.strictEqual(findAuthoritativeChainHead(updated)?.eventId, 'ev_b_4', 'New head is ev_b_4');
  });

  // --- Scenario C: Multiple genesis roots ---
  await test('Scenario C: Multiple genesis roots fails closed in findAuthoritativeChainHead, sortEventChain, executeTransaction, and EventStore.init', async () => {
    const root1 = makeEvent({
      eventId: 'ev_c_root1',
      aggregateId: 'batch_c_1',
      sequence: 1,
      previousEventHash: null,
    });
    const root2 = makeEvent({
      eventId: 'ev_c_root2',
      aggregateId: 'batch_c_2',
      sequence: 1,
      previousEventHash: null,
    });

    const valResult = validateEventChainIntegrity([root1, root2]);
    assert.strictEqual(valResult.valid, false, 'Multiple roots detected as invalid');
    assert.match(valResult.error || '', /Multiple genesis roots detected/);

    assert.throws(
      () => findAuthoritativeChainHead([root1, root2]),
      /Authoritative chain validation failed.*Multiple genesis roots/,
      'findAuthoritativeChainHead throws on multiple roots'
    );

    assert.throws(
      () => sortEventChain([root1, root2]),
      /Cannot sort invalid event chain.*Multiple genesis roots/,
      'sortEventChain throws on multiple roots'
    );

    // Seed invalid multiple roots in DB directly using low-level put
    await idbEngine.clearStore('domainEvents');
    eventStore.clear();
    await idbEngine.put('domainEvents', root1);
    await idbEngine.put('domainEvents', root2);

    // EventStore.init fails closed
    await assert.rejects(
      async () => {
        await eventStore.init(true);
      },
      /Authoritative event chain integrity violation.*Multiple genesis roots/,
      'EventStore.init rejects on multiple roots'
    );

    // executeTransaction fails closed and aborts
    const stagedEvent: DomainEvent = {
      eventId: 'ev_c_staged',
      eventType: 'INVENTORY_RECEIVED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_c_3',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: {},
      metadata: {},
      syncStatus: 'PENDING',
    };

    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
          await tx.put('domainEvents', stagedEvent);
        });
      },
      /Authoritative event chain integrity violation.*Multiple genesis roots/,
      'executeTransaction rejects and aborts on multiple roots'
    );
  });

  // --- Scenario D: Forked successor ---
  await test('Scenario D: Forked successor fails closed in findAuthoritativeChainHead, sortEventChain, executeTransaction, and EventStore.init', async () => {
    const root = makeEvent({
      eventId: 'ev_d_root',
      aggregateId: 'batch_d',
      sequence: 1,
      previousEventHash: null,
    });
    // Two competing successors branching from the same root
    const forkA = makeEvent({
      eventId: 'ev_d_fork_a',
      aggregateId: 'batch_d',
      sequence: 2,
      previousEventHash: root.eventHash,
      timestamp: '2026-10-24T10:00:00.000Z',
    });
    const forkB = makeEvent({
      eventId: 'ev_d_fork_b',
      aggregateId: 'batch_d',
      sequence: 2,
      previousEventHash: root.eventHash,
      timestamp: '2026-10-24T10:01:00.000Z',
    });

    const forkedSet = [root, forkA, forkB];
    const valResult = validateEventChainIntegrity(forkedSet);
    assert.strictEqual(valResult.valid, false, 'Forked chain detected as invalid');
    assert.match(valResult.error || '', /Fork detected on predecessor/);

    assert.throws(
      () => findAuthoritativeChainHead(forkedSet),
      /Authoritative chain validation failed.*Fork detected/,
      'findAuthoritativeChainHead throws on fork'
    );

    assert.throws(
      () => sortEventChain(forkedSet),
      /Cannot sort invalid event chain.*Fork detected/,
      'sortEventChain throws on fork'
    );

    // Seed forked state in DB directly using low-level put
    await idbEngine.clearStore('domainEvents');
    eventStore.clear();
    await idbEngine.put('domainEvents', root);
    await idbEngine.put('domainEvents', forkA);
    await idbEngine.put('domainEvents', forkB);

    // EventStore.init must fail closed
    await assert.rejects(
      async () => {
        await eventStore.init(true);
      },
      /Authoritative event chain integrity violation.*Fork detected/,
      'EventStore.init rejects on fork'
    );

    // executeTransaction must fail closed
    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(['domainEvents'], async (tx) => {
          await tx.put('domainEvents', {
            id: 'ev_d_staged',
            eventId: 'ev_d_staged',
            eventType: 'INVENTORY_ADJUSTED',
            aggregateType: 'InventoryBatch',
            aggregateId: 'batch_d',
            facilityId,
            actorId: 'usr-01',
            deviceId: 'dev-01',
            timestamp: new Date().toISOString(),
            sequence: 0,
            version: 1,
            payload: {},
            metadata: {},
            syncStatus: 'PENDING',
          });
        });
      },
      /Authoritative event chain integrity violation.*Fork detected/,
      'executeTransaction rejects on fork'
    );
  });

  // --- Scenario E: Multiple unreferenced heads ---
  await test('Scenario E: Multiple unreferenced heads fails closed without timestamp tiebreak', async () => {
    const root = makeEvent({
      eventId: 'ev_e_root',
      aggregateId: 'batch_e',
      sequence: 1,
      previousEventHash: null,
    });
    // Branch 1: ev_e_1
    const b1 = makeEvent({
      eventId: 'ev_e_1',
      aggregateId: 'batch_e',
      sequence: 2,
      previousEventHash: root.eventHash,
      timestamp: '2026-10-24T09:00:00.000Z',
    });
    // Branch 2: ev_e_2 with later timestamp
    const b2 = makeEvent({
      eventId: 'ev_e_2',
      aggregateId: 'batch_e',
      sequence: 2,
      previousEventHash: root.eventHash,
      timestamp: '2026-10-24T12:00:00.000Z',
    });

    // Previously, findAuthoritativeChainHead returned b2 because of its later timestamp.
    // Now it MUST throw an actionable error.
    assert.throws(
      () => findAuthoritativeChainHead([root, b1, b2]),
      /Authoritative chain validation failed/,
      'Must throw and NOT select b2 by timestamp'
    );

    const valResult = validateEventChainIntegrity([root, b1, b2]);
    assert.strictEqual(valResult.valid, false);
  });

  // --- Scenario F: Dangling predecessor reference ---
  await test('Scenario F: Dangling predecessor reference fails closed', async () => {
    const ev1 = makeEvent({
      eventId: 'ev_f_1',
      aggregateId: 'batch_f',
      sequence: 1,
      previousEventHash: null,
    });
    const ev2 = makeEvent({
      eventId: 'ev_f_2',
      aggregateId: 'batch_f',
      sequence: 2,
      previousEventHash: 'nonexistent_predecessor_hash_0123456789abcdef',
    });

    const valResult = validateEventChainIntegrity([ev1, ev2]);
    assert.strictEqual(valResult.valid, false, 'Dangling predecessor detected');
    assert.match(valResult.error || '', /Dangling predecessor reference/);

    assert.throws(
      () => findAuthoritativeChainHead([ev1, ev2]),
      /Authoritative chain validation failed.*Dangling predecessor reference/
    );

    assert.throws(
      () => sortEventChain([ev1, ev2]),
      /Cannot sort invalid event chain.*Dangling predecessor reference/
    );
  });

  // --- Scenario G: Disconnected cycle or unreachable events ---
  await test('Scenario G: Disconnected cycle or unreachable events fails closed', async () => {
    // Subcase 1: Valid root + event, plus disconnected cycle X -> Y -> X
    const root = makeEvent({
      eventId: 'ev_g_root',
      aggregateId: 'batch_g',
      sequence: 1,
      previousEventHash: null,
    });
    const ev1 = makeEvent({
      eventId: 'ev_g_1',
      aggregateId: 'batch_g',
      sequence: 2,
      previousEventHash: root.eventHash,
    });

    const cycleXPayload = { note: 'cycleX' };
    const cycleYPayload = { note: 'cycleY' };
    const hashX = computeEventHash({
      eventId: 'ev_g_x',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateId: 'batch_g_cycle',
      timestamp: new Date().toISOString(),
      sequence: 1,
      version: 1,
      payload: cycleXPayload,
    }, 'dummy_hash_y');

    const cycleX: DomainEvent = deepFreeze({
      eventId: 'ev_g_x',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_g_cycle',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 1,
      version: 1,
      payload: cycleXPayload,
      metadata: {},
      syncStatus: 'PENDING',
      previousEventHash: 'dummy_hash_y',
      eventHash: hashX,
    });

    const cycleY: DomainEvent = deepFreeze({
      eventId: 'ev_g_y',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_g_cycle',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 2,
      version: 1,
      payload: cycleYPayload,
      metadata: {},
      syncStatus: 'PENDING',
      previousEventHash: hashX,
      eventHash: 'dummy_hash_y',
    });

    const disconnectedFixture = [root, ev1, cycleX, cycleY];
    const valResult = validateEventChainIntegrity(disconnectedFixture);
    assert.strictEqual(valResult.valid, false, 'Disconnected cycle detected');

    assert.throws(
      () => findAuthoritativeChainHead(disconnectedFixture),
      /Authoritative chain validation failed/
    );

    assert.throws(
      () => sortEventChain(disconnectedFixture),
      /Cannot sort invalid event chain/
    );
  });

  // --- Scenario H: Tampered field / hash mismatch across all immutable fields ---
  await test('Scenario H: Tampering across all 15 immutable fields and unsupported hashVersion fails closed', async () => {
    const baseRoot = makeEvent({
      eventId: 'ev_h_root',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_h',
      facilityId: 'fac-01',
      actorId: 'usr-01',
      deviceId: 'dev-01',
      sequence: 1,
      previousEventHash: null,
      timestamp: '2026-10-24T12:00:00.000Z',
      payload: { quantity: 50 },
      metadata: { source: 'test' },
      clientCreatedAt: '2026-10-24T12:00:00.000Z',
      clientUpdatedAt: '2026-10-24T12:00:00.000Z',
      hashVersion: 2,
    });

    const baseEv1 = makeEvent({
      eventId: 'ev_h_1',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_h',
      facilityId: 'fac-01',
      actorId: 'usr-01',
      deviceId: 'dev-01',
      sequence: 2,
      previousEventHash: baseRoot.eventHash,
      timestamp: '2026-10-24T12:01:00.000Z',
      payload: { quantity: 30 },
      metadata: { reason: 'adjustment' },
      clientCreatedAt: '2026-10-24T12:01:00.000Z',
      clientUpdatedAt: '2026-10-24T12:01:00.000Z',
      hashVersion: 2,
    });

    // Verify baseline pair is valid
    const baseline = validateEventChainIntegrity([baseRoot, baseEv1]);
    assert.strictEqual(baseline.valid, true, 'Baseline event pair is valid');

    // Helper to test that tampering a specific field in baseEv1 fails closed
    const assertTamperDetected = (fieldName: string, tamperedMutator: (ev: DomainEvent) => DomainEvent, expectedPattern = /Event hash mismatch/) => {
      const tampered = deepFreeze(tamperedMutator({ ...baseEv1 }));
      const valResult = validateEventChainIntegrity([baseRoot, tampered]);
      assert.strictEqual(valResult.valid, false, `Tampering with ${fieldName} must be detected as invalid`);
      assert.match(valResult.error || '', expectedPattern, `Error message for ${fieldName} must match expected pattern`);

      assert.throws(
        () => findAuthoritativeChainHead([baseRoot, tampered]),
        expectedPattern,
        `findAuthoritativeChainHead must throw on tampered ${fieldName}`
      );
      assert.throws(
        () => sortEventChain([baseRoot, tampered]),
        expectedPattern,
        `sortEventChain must throw on tampered ${fieldName}`
      );
    };

    // 1. aggregateType
    assertTamperDetected('aggregateType', (ev) => ({ ...ev, aggregateType: 'ClinicalOrder' as any }));
    // 2. facilityId
    assertTamperDetected('facilityId', (ev) => ({ ...ev, facilityId: 'fac-TAMPERED-99' }));
    // 3. actorId
    assertTamperDetected('actorId', (ev) => ({ ...ev, actorId: 'usr-MALICIOUS-99' }));
    // 4. deviceId
    assertTamperDetected('deviceId', (ev) => ({ ...ev, deviceId: 'dev-ROGUE-99' }));
    // 5. eventId
    assertTamperDetected('eventId', (ev) => ({ ...ev, eventId: 'ev_tampered_id' }));
    // 6. eventType
    assertTamperDetected('eventType', (ev) => ({ ...ev, eventType: 'DISPENSE_COMPLETED' as any }));
    // 7. aggregateId
    assertTamperDetected('aggregateId', (ev) => ({ ...ev, aggregateId: 'batch_h_tampered' }));
    // 8. timestamp
    assertTamperDetected('timestamp', (ev) => ({ ...ev, timestamp: '1999-01-01T00:00:00.000Z' }));
    // 9. sequence
    assertTamperDetected('sequence', (ev) => ({ ...ev, sequence: 999 }));
    // 10. version
    assertTamperDetected('version', (ev) => ({ ...ev, version: 5 }));
    // 11. payload
    assertTamperDetected('payload', (ev) => ({ ...ev, payload: { quantity: 999999 } }));
    // 12. previousEventHash
    assertTamperDetected(
      'previousEventHash',
      (ev) => ({ ...ev, previousEventHash: '0000000000000000000000000000000000000000000000000000000000000000' }),
      /Dangling predecessor reference|Event hash mismatch/
    );
    // Direct verification that computeEventHash binds previousEventHash
    const hashA = computeEventHash(baseEv1, baseRoot.eventHash);
    const hashB = computeEventHash(baseEv1, 'different_predecessor_hash');
    assert.notStrictEqual(hashA, hashB, 'computeEventHash must bind previousEventHash');
    // 13. metadata
    assertTamperDetected('metadata', (ev) => ({ ...ev, metadata: { correlationId: 'corr-TAMPERED-99' } }));
    // 14. clientCreatedAt & clientUpdatedAt
    assertTamperDetected('clientCreatedAt', (ev) => ({ ...ev, clientCreatedAt: '2020-01-01T00:00:00.000Z' }));
    assertTamperDetected('clientUpdatedAt', (ev) => ({ ...ev, clientUpdatedAt: '2020-01-01T00:00:00.000Z' }));
    // 15. Unsupported hashVersion
    assertTamperDetected('hashVersion (unsupported 999)', (ev) => ({ ...ev, hashVersion: 999 }), /Unsupported event hash version.*999/);
    assertTamperDetected('hashVersion (negative -1)', (ev) => ({ ...ev, hashVersion: -1 }), /Unsupported event hash version.*-1/);

    // Also assert that mutating root's facilityId or aggregateType fails closed in executeTransaction
    await idbEngine.clearStore('domainEvents');
    await idbEngine.clearStore('inventoryBatches');
    eventStore.clear();

    const tamperedRoot: DomainEvent = {
      ...baseRoot,
      facilityId: 'fac-TAMPERED-ROOT', // Tampered facility provenance!
    };
    await idbEngine.put('domainEvents', tamperedRoot);

    const stagedBatch: InventoryBatch = {
      id: 'batch_h_rollback_test',
      inventoryItemId: 'item_h_01',
      facilityId,
      batchNumber: 'BATCH-H-ROLLBACK',
      lotNumber: 'LOT-H-01',
      expiryDate: '2029-12-31',
      quantityOnHand: 100,
      reservedQuantity: 0,
      availableQuantity: 100,
      supplierId: 'SUP-01',
      supplierName: 'Supplier H',
      receivedAt: new Date().toISOString(),
      receivedById: 'usr-01',
      receivedByName: 'Pharmacist H',
      status: 'AVAILABLE',
      provenance: {
        source: 'TEST',
        version: '1.0',
        recordedBy: 'usr-01',
        recordedAt: new Date().toISOString(),
        deviceId: 'dev-01',
        facilityId,
        actorId: 'usr-01',
        createdAt: new Date().toISOString(),
      },
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const stagedAppendEvent: DomainEvent = {
      eventId: 'ev_h_staged',
      eventType: 'INVENTORY_ADJUSTED',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_h_rollback_test',
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: new Date().toISOString(),
      sequence: 0,
      version: 1,
      payload: { quantity: 100 },
      metadata: {},
      syncStatus: 'PENDING',
    };

    await assert.rejects(
      async () => {
        await idbEngine.executeTransaction(['inventoryBatches', 'domainEvents'], async (txContext) => {
          await txContext.put('inventoryBatches', stagedBatch);
          await txContext.put('domainEvents', stagedAppendEvent);
        });
      },
      /Authoritative event chain integrity violation.*Event hash mismatch/,
      'executeTransaction must fail closed when provenance is tampered on prior chain event'
    );

    const uncommittedBatch = await idbEngine.get('inventoryBatches', 'batch_h_rollback_test');
    assert.strictEqual(uncommittedBatch ?? null, null, 'Staged batch must roll back completely when provenance hash mismatch occurs');
  });

  // --- Scenario I: Duplicate eventId or eventHash ---
  await test('Scenario I: Duplicate eventId or eventHash fails closed', async () => {
    const root = makeEvent({
      eventId: 'ev_i_dup_id',
      aggregateId: 'batch_i_1',
      sequence: 1,
      previousEventHash: null,
    });
    const dupIdEvent = makeEvent({
      eventId: 'ev_i_dup_id', // Duplicate eventId!
      aggregateId: 'batch_i_2',
      sequence: 1,
      previousEventHash: root.eventHash,
    });

    const valResultId = validateEventChainIntegrity([root, dupIdEvent]);
    assert.strictEqual(valResultId.valid, false, 'Duplicate eventId detected');
    assert.match(valResultId.error || '', /Duplicate eventId detected/);

    assert.throws(
      () => findAuthoritativeChainHead([root, dupIdEvent]),
      /Authoritative chain validation failed.*Duplicate eventId/
    );

    assert.throws(
      () => sortEventChain([root, dupIdEvent]),
      /Cannot sort invalid event chain.*Duplicate eventId/
    );

    // Duplicate eventHash
    const evA = makeEvent({
      eventId: 'ev_i_a',
      aggregateId: 'batch_i_a',
      sequence: 1,
      previousEventHash: null,
    });
    const evB: DomainEvent = deepFreeze({
      ...makeEvent({
        eventId: 'ev_i_b',
        aggregateId: 'batch_i_b',
        sequence: 2,
        previousEventHash: evA.eventHash,
      }),
      eventHash: evA.eventHash, // Duplicate eventHash!
    });

    const valResultHash = validateEventChainIntegrity([evA, evB]);
    assert.strictEqual(valResultHash.valid, false, 'Duplicate eventHash detected');
    assert.match(valResultHash.error || '', /Duplicate eventHash detected/);
  });

  // --- Scenario J: Atomic transaction abort ---
  await test('Scenario J: Atomic transaction abort — business mutations roll back completely on chain failure', async () => {
    // 1. Corrupt domainEvents with a forked chain
    await idbEngine.clearStore('domainEvents');
    await idbEngine.clearStore('inventoryBatches');
    await idbEngine.clearStore('inventoryTransactions');
    eventStore.clear();

    const root = makeEvent({
      eventId: 'ev_j_root',
      aggregateId: 'batch_j_seed',
      sequence: 1,
      previousEventHash: null,
    });
    const forkA = makeEvent({
      eventId: 'ev_j_fork_a',
      aggregateId: 'batch_j_seed',
      sequence: 2,
      previousEventHash: root.eventHash,
    });
    const forkB = makeEvent({
      eventId: 'ev_j_fork_b',
      aggregateId: 'batch_j_seed',
      sequence: 2,
      previousEventHash: root.eventHash,
    });

    await idbEngine.put('domainEvents', root);
    await idbEngine.put('domainEvents', forkA);
    await idbEngine.put('domainEvents', forkB);

    // 2. Prepare business mutations coupled with a domain event
    const testBatchId = 'batch_atomic_rollback_test_01';
    const testTxnId = 'txn_atomic_rollback_test_01';
    const now = new Date().toISOString();

    const stagedBatch: InventoryBatch = {
      id: testBatchId,
      inventoryItemId: 'item_j_01',
      facilityId,
      batchNumber: 'BATCH-J-ROLLBACK',
      lotNumber: 'LOT-J-01',
      expiryDate: '2029-12-31',
      quantityOnHand: 250,
      reservedQuantity: 0,
      availableQuantity: 250,
      supplierId: 'SUP-01',
      supplierName: 'Test Supplier',
      receivedAt: now,
      receivedById: 'usr-01',
      receivedByName: 'Pharmacist J',
      status: 'AVAILABLE',
      provenance: {
        source: 'TEST',
        version: '1.0',
        recordedBy: 'usr-01',
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

    const stagedTxn: InventoryTransaction = {
      id: testTxnId,
      facilityId,
      inventoryItemId: 'item_j_01',
      batchId: testBatchId,
      transactionType: 'RECEIPT',
      quantity: 250,
      unit: 'tablets',
      referenceType: 'MANUAL_ADJUSTMENT',
      referenceId: 'REF-J-01',
      actorId: 'usr-01',
      actorName: 'Pharmacist J',
      actorRole: 'pharmacist',
      occurredAt: now,
      reason: 'Atomic rollback test',
      source: 'TEST',
      version: 1,
      eventId: 'ev_j_staged_new',
    };

    const stagedEvent: DomainEvent = {
      eventId: 'ev_j_staged_new',
      eventType: 'INVENTORY_RECEIVED',
      aggregateType: 'InventoryBatch',
      aggregateId: testBatchId,
      facilityId,
      actorId: 'usr-01',
      deviceId: 'dev-01',
      timestamp: now,
      sequence: 0,
      version: 1,
      payload: { quantity: 250 },
      metadata: {},
      syncStatus: 'PENDING',
    };

    // 3. Attempt to execute the multi-store transaction
    let caughtErr: any = null;
    try {
      await idbEngine.executeTransaction(
        ['inventoryBatches', 'inventoryTransactions', 'domainEvents'],
        async (txContext) => {
          await txContext.put('inventoryBatches', stagedBatch);
          await txContext.put('inventoryTransactions', stagedTxn);
          await txContext.put('domainEvents', stagedEvent);
        }
      );
    } catch (err: any) {
      caughtErr = err;
    }

    // Assert executeTransaction failed and rejected
    assert.ok(caughtErr, 'executeTransaction MUST reject on chain integrity failure');
    assert.match(
      caughtErr.message,
      /Authoritative event chain integrity violation/,
      'Rejection must report authoritative event chain integrity violation'
    );

    // 4. Assert direct storage state: NO business records or events were committed
    const batchInDb = await idbEngine.get<InventoryBatch>('inventoryBatches', testBatchId);
    assert.strictEqual(batchInDb ?? null, null, 'Staged batch must NOT commit to IndexedDB on transaction abort');

    const txnInDb = await idbEngine.get<InventoryTransaction>('inventoryTransactions', testTxnId);
    assert.strictEqual(txnInDb ?? null, null, 'Staged transaction must NOT commit to IndexedDB on transaction abort');

    const evInDb = await idbEngine.get<DomainEvent>('domainEvents', 'ev_j_staged_new');
    assert.strictEqual(evInDb ?? null, null, 'Staged event must NOT commit to IndexedDB on transaction abort');

    // Stored domainEvents still has only the original 3 corrupt records, unchanged
    const storedEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert.strictEqual(storedEvents.length, 3, 'Corrupt store was not mutated or overwritten');
  });

  // --- Scenario K: Backward-compatible legacy V1 validation and V1 -> V2 chaining ---
  await test('Scenario K: Backward-compatible legacy V1 validation, V1 -> V2 chaining, and executeTransaction append', async () => {
    // 1. Create a pure legacy V1 event (hashVersion undefined or 1)
    const legacyV1Root = makeEvent({
      eventId: 'ev_k_legacy_1',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_k_1',
      sequence: 1,
      previousEventHash: null,
      hashVersion: 1,
      payload: { quantity: 100 },
    });
    assert.strictEqual(legacyV1Root.hashVersion, 1);

    // Verify V1 validates as single root
    const v1Validation = validateEventChainIntegrity([legacyV1Root]);
    assert.strictEqual(v1Validation.valid, true, 'Legacy V1 root event is valid');
    assert.strictEqual(v1Validation.head?.eventId, 'ev_k_legacy_1');

    // 2. Link a modern V2 event to the legacy V1 root
    const modernV2Event = makeEvent({
      eventId: 'ev_k_modern_2',
      aggregateType: 'InventoryBatch',
      aggregateId: 'batch_k_1',
      sequence: 2,
      previousEventHash: legacyV1Root.eventHash,
      hashVersion: 2,
      payload: { quantity: 150 },
    });

    const chainValidation = validateEventChainIntegrity([legacyV1Root, modernV2Event]);
    assert.strictEqual(chainValidation.valid, true, 'V1 -> V2 mixed chain is valid');
    assert.strictEqual(chainValidation.head?.eventId, 'ev_k_modern_2');

    // 3. Test through IndexedDB and executeTransaction: append V2 event onto legacy V1 store
    await idbEngine.clearStore('domainEvents');
    eventStore.clear();
    await idbEngine.put('domainEvents', legacyV1Root);

    await idbEngine.executeTransaction(['domainEvents'], async (txContext) => {
      const stagedAppend: DomainEvent = {
        eventId: 'ev_k_appended_3',
        eventType: 'INVENTORY_ADJUSTED',
        aggregateType: 'InventoryBatch',
        aggregateId: 'batch_k_1',
        facilityId,
        actorId: 'usr-01',
        deviceId: 'dev-01',
        timestamp: new Date().toISOString(),
        sequence: 0,
        version: 1,
        payload: { diff: 20 },
        metadata: {},
        syncStatus: 'PENDING',
      };
      await txContext.put('domainEvents', stagedAppend);
    });

    const storedEvents = await idbEngine.getAll<DomainEvent>('domainEvents');
    assert.strictEqual(storedEvents.length, 2, 'Stored events contains legacy root and newly appended event');
    const appended = storedEvents.find((e) => e.eventId === 'ev_k_appended_3');
    assert.ok(appended, 'Appended event exists');
    assert.strictEqual(appended.hashVersion, 2, 'Newly appended event uses hashVersion 2');
    assert.strictEqual(appended.previousEventHash, legacyV1Root.eventHash, 'Appended event references legacy V1 root hash');
    assert.strictEqual(appended.sequence, 2, 'Aggregate sequence continued monotonically to 2');

    const finalVal = validateEventChainIntegrity(storedEvents);
    assert.strictEqual(finalVal.valid, true, 'Resulting chain in storage is completely valid');
    assert.strictEqual(finalVal.head?.eventId, 'ev_k_appended_3', 'Head is the newly appended V2 event');
  });

  console.log('\n========================================================================');
  console.log(`ALL ${passed}/${passed} STAGE 3.2.5.7.2.3 FAIL-CLOSED CHAIN INTEGRITY TESTS PASSED`);
  console.log('========================================================================\n');
}

runStage325723Tests().catch((err) => {
  console.error('\nStage 3.2.5.7.2.3 test execution failed:', err);
  process.exit(1);
});
