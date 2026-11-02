/**
 * Jano Health - Clinical Core V20: System Intelligence & Governed Automation
 * Simulation Engine & Deterministic What-If Scenario Modeler
 * 
 * INVARIANTS:
 * - Simulation ≠ Production Action.
 * - Forecast ≠ Fact.
 * - Simulations do NOT modify production state.
 * - Clear label: SIMULATION — NO PRODUCTION STATE CHANGED.
 * - Output must explicitly state assumptions and uncertainty.
 */

import { SystemSimulationScenario } from '../../domain/v20SystemIntelligenceTypes';
import { idbEngine } from '../storage/indexedDbEngine';

export class SimulationEngine {
  private static instance: SimulationEngine;

  private scenariosCache = new Map<string, SystemSimulationScenario>();

  private constructor() {}

  public static getInstance(): SimulationEngine {
    if (!SimulationEngine.instance) {
      SimulationEngine.instance = new SimulationEngine();
    }
    return SimulationEngine.instance;
  }

  /**
   * Runs a deterministic operational simulation scenario without touching production data.
   */
  public async runSimulation(input: {
    name: string;
    assumedChange: string;
    horizonHours: number;
    scenarioType: 'EMERGENCY_SURGE' | 'NETWORK_NODE_FAILURE' | 'SUPPLY_DELAY' | 'WORKFORCE_DEFICIT' | 'LAB_BACKLOG';
    inputSnapshot?: Record<string, any>;
  }): Promise<SystemSimulationScenario> {
    const scenarioId = `sim-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const projectedEffects: SystemSimulationScenario['projectedEffects'] = [];
    const dependencies: string[] = [];
    const assumptions: string[] = [];

    if (input.scenarioType === 'EMERGENCY_SURGE') {
      assumptions.push('Assumes 40% sudden increase in emergency department admissions over baseline.');
      assumptions.push('Assumes current on-duty nursing roster remains constant without call-ins.');
      dependencies.push('bed_capacity', 'triage_nursing', 'emergency_pharmacy_stock');

      projectedEffects.push({
        domain: 'emergency',
        expectedImpact: 'Emergency bed utilization reaches 108% within 4 hours (Constrained).',
        confidence: 0.88,
        risks: ['Triage queue delay', 'Bed turnover saturation'],
      });
      projectedEffects.push({
        domain: 'pharmacy',
        expectedImpact: 'Emergency resuscitation kit burn rate increases by 2.2x.',
        confidence: 0.82,
        risks: ['Rapid stockout of emergency analgesics and IV fluids'],
      });
    } else if (input.scenarioType === 'NETWORK_NODE_FAILURE') {
      assumptions.push('Assumes primary regional network bridge node goes offline.');
      assumptions.push('Assumes local facility offline stores function normally.');
      dependencies.push('sync_queue', 'referral_exchange', 'fhir_gateway');

      projectedEffects.push({
        domain: 'network',
        expectedImpact: 'Outbound exchange transitions to local store-and-forward queue buffer.',
        confidence: 0.95,
        risks: ['Pending outbound referrals increase to 45 items in 6 hours'],
      });
      projectedEffects.push({
        domain: 'clinical',
        expectedImpact: 'Zero clinical disruption locally; encounters and prescriptions continue offline.',
        confidence: 0.99,
        risks: ['External referral destination notification delayed until reconnection'],
      });
    } else if (input.scenarioType === 'SUPPLY_DELAY') {
      assumptions.push('Assumes scheduled inter-facility delivery of antibiotics delayed by 72 hours.');
      dependencies.push('pharmacy_inventory', 'inpatient_prescriptions');

      projectedEffects.push({
        domain: 'supply',
        expectedImpact: 'Amoxicillin stock reaches reorder point in 36 hours and zero in 58 hours.',
        confidence: 0.91,
        risks: ['Potential stockout before shipment arrival'],
      });
    } else {
      assumptions.push('Assumes baseline diagnostic processing rates subject to 50% technical latency.');
      dependencies.push('lab_workstation', 'referral_pressure');

      projectedEffects.push({
        domain: 'laboratory',
        expectedImpact: 'Specimen turnaround time increases from 45 min to 95 min.',
        confidence: 0.85,
        risks: ['Emergency assessment delay for critical blood panels'],
      });
    }

    const scenario: SystemSimulationScenario = {
      scenarioId,
      name: input.name,
      assumedChange: input.assumedChange,
      horizonHours: input.horizonHours,
      inputSnapshot: input.inputSnapshot || {},
      projectedEffects,
      dependencies,
      assumptions,
      isSimulationOnly: true, // MASTER INVARIANT: Never touches production state
      createdAt: new Date().toISOString(),
    };

    this.scenariosCache.set(scenarioId, scenario);
    await idbEngine.put('simulationScenarios', scenario);
    return scenario;
  }

  public async getScenarios(): Promise<SystemSimulationScenario[]> {
    let list: SystemSimulationScenario[] = [];
    try {
      const stored = await idbEngine.getAll<SystemSimulationScenario>('simulationScenarios');
      if (stored && stored.length > 0) list = stored;
      else list = Array.from(this.scenariosCache.values());
    } catch {
      list = Array.from(this.scenariosCache.values());
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list;
  }

  public clearMemoryCache(): void {
    this.scenariosCache.clear();
  }
}

export const simulationEngine = SimulationEngine.getInstance();
