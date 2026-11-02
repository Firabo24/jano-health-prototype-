/**
 * Jano Health - Clinical Conflict Arbitration Service
 * 
 * Implements IConflictResolver.
 * Avoids silent overwrites by explicitly capturing clinical conflicts between local client
 * replicas and remote server aggregates. Supports manual and semi-automated arbitration:
 * - RESOLVED_LOCAL: Retain bedside clinician's immediate data
 * - RESOLVED_REMOTE: Overwrite with central hospital/lab official version
 * - RESOLVED_MERGED: Clinician selects combined fields
 */

import {
  ClinicalConflict,
  ConflictResolutionStatus,
  DomainEvent,
  IConflictResolver,
} from '../../domain/persistence';
import { generateConflictId } from '../../domain/identifiers';
import { idbEngine } from '../storage/indexedDbEngine';
import { localRepository } from '../storage/localRepository';

export class ConflictResolver implements IConflictResolver {
  private static instance: ConflictResolver;
  private conflicts: Map<string, ClinicalConflict> = new Map();
  private listeners: Set<(conflicts: ClinicalConflict[]) => void> = new Set();
  private initialized = false;

  private constructor() {
    this.init();
  }

  public static getInstance(): ConflictResolver {
    if (!ConflictResolver.instance) {
      ConflictResolver.instance = new ConflictResolver();
    }
    return ConflictResolver.instance;
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    try {
      const list = await idbEngine.getAll<ClinicalConflict>('conflicts');
      list.forEach((c) => this.conflicts.set(c.conflictId, c));
      this.initialized = true;
    } catch {
      this.initialized = true;
    }
  }

  /**
   * Compare a locally committed event with remote state to detect concurrency divergence.
   */
  public async detectConflict(
    localEvent: DomainEvent,
    remoteState: Record<string, unknown>
  ): Promise<ClinicalConflict | null> {
    await this.init();

    const remoteVersion = (remoteState.version as number) || 1;
    // Conflict exists if remote version is strictly greater or divergent
    if (remoteVersion > localEvent.version) {
      const conflict: ClinicalConflict = {
        conflictId: generateConflictId(),
        aggregateType: localEvent.aggregateType,
        aggregateId: localEvent.aggregateId,
        localVersion: localEvent.version,
        remoteVersion,
        localEvent,
        remoteEvent: remoteState,
        detectedAt: new Date().toISOString(),
        resolutionStatus: 'PENDING',
      };

      await this.recordConflict(conflict);
      return conflict;
    }

    return null;
  }

  public async recordConflict(conflict: ClinicalConflict): Promise<void> {
    await this.init();
    this.conflicts.set(conflict.conflictId, conflict);
    await idbEngine.put('conflicts', conflict);
    this.notify();
  }

  public async getPendingConflicts(): Promise<ClinicalConflict[]> {
    await this.init();
    return Array.from(this.conflicts.values())
      .filter((c) => c.resolutionStatus === 'PENDING')
      .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  }

  public async getConflictById(conflictId: string): Promise<ClinicalConflict | undefined> {
    await this.init();
    return this.conflicts.get(conflictId);
  }

  public async resolveConflict(
    conflictId: string,
    resolution: ConflictResolutionStatus,
    mergedPayload?: Record<string, unknown>,
    resolverUserId = 'clinician-current',
    notes?: string
  ): Promise<void> {
    await this.init();
    const conflict = this.conflicts.get(conflictId);
    if (!conflict) return;

    conflict.resolutionStatus = resolution;
    conflict.resolvedAt = new Date().toISOString();
    conflict.resolvedBy = resolverUserId;
    conflict.resolutionNotes = notes;
    conflict.mergedPayload = mergedPayload;

    // Apply resolved state to local clinical repository
    if (resolution === 'RESOLVED_REMOTE' && conflict.remoteEvent) {
      await this.applyPayloadToLocalRepository(conflict.aggregateType, conflict.remoteEvent);
    } else if (resolution === 'RESOLVED_MERGED' && mergedPayload) {
      await this.applyPayloadToLocalRepository(conflict.aggregateType, mergedPayload);
    }

    await idbEngine.put('conflicts', conflict);
    this.notify();
  }

  private async applyPayloadToLocalRepository(
    aggregateType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    try {
      if (aggregateType === 'Patient') {
        await localRepository.savePatient(payload as any);
      } else if (aggregateType === 'Encounter') {
        await localRepository.saveEncounter(payload as any);
      } else if (aggregateType === 'ClinicalNote') {
        await localRepository.saveClinicalNote(payload as any);
      } else if (aggregateType === 'Medication') {
        await localRepository.saveMedication(payload as any);
      }
    } catch (err) {
      console.error('[ConflictResolver] Error applying resolved state:', err);
    }
  }

  public subscribe(listener: (conflicts: ClinicalConflict[]) => void): () => void {
    this.listeners.add(listener);
    this.getPendingConflicts().then((c) => listener(c));
    return () => this.listeners.delete(listener);
  }

  private async notify(): Promise<void> {
    const list = await this.getPendingConflicts();
    this.listeners.forEach((fn) => fn(list));
  }
}

export const conflictResolver = ConflictResolver.getInstance();
