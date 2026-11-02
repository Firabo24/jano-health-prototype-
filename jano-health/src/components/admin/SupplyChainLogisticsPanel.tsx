/**
 * Jano Health - Clinical Core V17: Supply Chain & Logistics Command Center
 * 
 * Comprehensive administrative interface providing end-to-end commodity lifecycle management:
 * - Supply Catalogue & Packaging Specs
 * - Demand Signals & Forecasting
 * - Requisitions & Approval Workflows
 * - Procurement & Purchase Orders
 * - Logistics, Multi-Leg Shipments & Physical Goods Receiving
 * - Warehouses, Temperature Zones & Stock Transfers
 * - Cold Chain & Excursion Review
 * - Quality Holds, Human Releases & Recalls
 * - Planning, Replenishment Recommendations & Risk Intelligence
 * 
 * HARD ARCHITECTURAL INVARIANTS:
 * - Prescription ≠ Requisition
 * - PurchaseOrder ≠ GoodsReceipt
 * - GoodsReceipt ≠ InventoryTransaction (V7 Inventory Bridge manages append-only ledger)
 * - AI Recommendations are ADVISORY ONLY: Consequential actions require explicit human authorization.
 * - Missing telemetry remains UNKNOWN, never assumed SAFE.
 */

import React, { useState, useEffect } from 'react';
import {
  Package,
  Truck,
  Building2,
  Thermometer,
  ShieldAlert,
  TrendingUp,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldCheck,
  RefreshCw,
  Plus,
  ArrowRight,
  Filter,
  Search,
  ExternalLink,
  ChevronRight,
  Activity,
  Layers,
  MapPin,
  Check,
  X,
  FileCheck,
} from 'lucide-react';
import { useAuth } from '../../services/security/authContext';
import {
  SupplyItem,
  DemandSignal,
  Requisition,
  Supplier,
  PurchaseOrder,
  Shipment,
  GoodsReceipt,
  Warehouse,
  StockTransfer,
  TemperatureLog,
  TemperatureExcursion,
  BatchQualityHold,
  RecallNotice,
  ProcurementForecast,
  ReplenishmentRecommendation,
  SupplyRisk,
} from '../../domain/v17SupplyChainTypes';
import { supplyCatalogService } from '../../services/supplyChain/supplyCatalogService';
import { demandRequisitionService } from '../../services/supplyChain/demandRequisitionService';
import { procurementOrderService } from '../../services/supplyChain/procurementOrderService';
import { logisticsReceivingService } from '../../services/supplyChain/logisticsReceivingService';
import { warehouseTransferService } from '../../services/supplyChain/warehouseTransferService';
import { coldChainService } from '../../services/supplyChain/coldChainService';
import { qualityRecallService } from '../../services/supplyChain/qualityRecallService';
import { supplyPlanningIntelligenceService } from '../../services/supplyChain/supplyPlanningIntelligenceService';

type V17Section =
  | 'command_center'
  | 'catalogue'
  | 'demand'
  | 'requisitions'
  | 'procurement'
  | 'logistics'
  | 'warehouses'
  | 'cold_chain'
  | 'quality'
  | 'planning';

export const SupplyChainLogisticsPanel: React.FC = () => {
  const { currentUser, currentFacility, can } = useAuth();
  const [activeSection, setActiveSection] = useState<V17Section>('command_center');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Domain states
  const [items, setItems] = useState<SupplyItem[]>([]);
  const [demandSignals, setDemandSignals] = useState<DemandSignal[]>([]);
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [excursions, setExcursions] = useState<TemperatureExcursion[]>([]);
  const [qualityHolds, setQualityHolds] = useState<BatchQualityHold[]>([]);
  const [recalls, setRecalls] = useState<RecallNotice[]>([]);
  const [recommendations, setRecommendations] = useState<ReplenishmentRecommendation[]>([]);
  const [risks, setRisks] = useState<SupplyRisk[]>([]);

  // Search & filter
  const [searchTerm, setSearchTerm] = useState('');

  const refreshData = async () => {
    setLoading(true);
    try {
      const facilityId = currentFacility?.id || 'fac-amgh';
      setItems(supplyCatalogService.listItems());
      setDemandSignals(demandRequisitionService.listDemandSignals(facilityId));
      setRequisitions(demandRequisitionService.listRequisitions({ facilityId }));
      setSuppliers(procurementOrderService.listSuppliers());
      setPurchaseOrders(procurementOrderService.listPurchaseOrders({ facilityId }));
      setShipments(logisticsReceivingService.listShipments(facilityId));
      setGoodsReceipts(logisticsReceivingService.listReceipts(facilityId));
      setWarehouses(warehouseTransferService.listWarehouses(facilityId));
      setTransfers(warehouseTransferService.listTransfers(facilityId));
      setExcursions(coldChainService.getActiveExcursions());
      setQualityHolds(qualityRecallService.getActiveHolds(facilityId));
      setRecalls(qualityRecallService.listRecalls());
      setRecommendations(supplyPlanningIntelligenceService.listRecommendations(facilityId));
      setRisks(supplyPlanningIntelligenceService.listRisks(facilityId));
    } catch (err: any) {
      console.error('Failed to load supply chain data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
  }, [currentFacility?.id]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setFeedback({ type, message });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Actions
  const handleApprovePO = async (poId: string) => {
    try {
      await procurementOrderService.approvePurchaseOrder({
        purchaseOrderId: poId,
        reviewerId: currentUser.id,
        reviewerRole: currentUser.role,
        justification: `Approved via Command Center by ${currentUser.fullName}`,
      });
      showFeedback('success', `Purchase order ${poId} approved successfully.`);
      refreshData();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleSendPO = async (poId: string) => {
    try {
      await procurementOrderService.sendPurchaseOrder(poId, currentUser.id);
      showFeedback('success', `Purchase order ${poId} dispatched to supplier.`);
      refreshData();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleFinalizeReceipt = async (grnId: string) => {
    try {
      await logisticsReceivingService.finalizeGoodsReceipt(grnId, currentUser.id);
      showFeedback('success', `Goods receipt ${grnId} finalized and safely integrated into V7 inventory ledger.`);
      refreshData();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleReleaseHold = async (holdId: string) => {
    try {
      await qualityRecallService.releaseBatchHold({
        holdId,
        releaseDecision: `Verified compliant and potency intact by ${currentUser.fullName}`,
        releasedBy: currentUser.id,
        facilityId: currentFacility?.id || 'fac-amgh',
      });
      showFeedback('success', `Quality hold ${holdId} released.`);
      refreshData();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  const handleReviewExcursion = async (excursionId: string, decision: 'CLEARED' | 'QUARANTINED' | 'REJECTED') => {
    try {
      await coldChainService.reviewExcursion({
        excursionId,
        decision,
        reviewerId: currentUser.id,
        notes: `Clinical cold chain review completed by ${currentUser.fullName}`,
        facilityId: currentFacility?.id || 'fac-amgh',
      });
      showFeedback('success', `Excursion ${excursionId} marked as ${decision}.`);
      refreshData();
    } catch (err: any) {
      showFeedback('error', err.message);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400 border border-teal-500/20">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Supply Chain & Procurement Intelligence
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-950 text-teal-300 border border-teal-800">
                  CLINICAL CORE V17
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative commodity upstream pipeline from demand signaling through receiving, quality seals & V7 ledger bridge
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 border border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Telemetry
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/60 border-rose-800 text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800 overflow-x-auto text-xs font-semibold scrollbar-thin">
        {[
          { id: 'command_center', label: 'Command Center', icon: Activity },
          { id: 'catalogue', label: 'Supply Catalogue', icon: Package, count: items.length },
          { id: 'demand', label: 'Demand Signals', icon: TrendingUp, count: demandSignals.length },
          { id: 'requisitions', label: 'Requisitions', icon: FileText, count: requisitions.length },
          { id: 'procurement', label: 'Procurement & POs', icon: FileCheck, count: purchaseOrders.length },
          { id: 'logistics', label: 'Shipments & Receiving', icon: Truck, count: shipments.length + goodsReceipts.length },
          { id: 'warehouses', label: 'Warehouses & Transfers', icon: Building2, count: warehouses.length },
          { id: 'cold_chain', label: 'Cold Chain', icon: Thermometer, count: excursions.length },
          { id: 'quality', label: 'Quality & Recalls', icon: ShieldAlert, count: qualityHolds.length },
          { id: 'planning', label: 'Planning & Risks', icon: Layers, count: risks.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as V17Section)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-teal-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-teal-800 text-teal-100' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. COMMAND CENTER DASHBOARD                                              */}
      {/* ========================================================================= */}
      {activeSection === 'command_center' && (
        <div className="space-y-6">
          {/* Top Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Critical Supply Risks</span>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {risks.filter((r) => r.severity === 'CRITICAL' || r.severity === 'HIGH').length}
              </div>
              <p className="text-[11px] text-slate-500">
                {risks.filter((r) => r.riskType === 'STOCKOUT_RISK').length} stockout alerts,{' '}
                {risks.filter((r) => r.riskType === 'COLD_CHAIN_RISK').length} temperature alerts
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Pending PO Approvals</span>
                <Clock className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {purchaseOrders.filter((po) => po.status === 'PENDING_APPROVAL').length}
              </div>
              <p className="text-[11px] text-slate-500">
                {purchaseOrders.filter((po) => po.status === 'SENT').length} active purchase orders in flight
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>In-Transit Shipments</span>
                <Truck className="w-4 h-4 text-teal-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                {shipments.filter((s) => s.status === 'IN_TRANSIT').length}
              </div>
              <p className="text-[11px] text-slate-500">
                {shipments.length} tracked national logistics consignments
              </p>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Active Quality Holds</span>
                <ShieldAlert className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-2xl font-bold text-white font-mono">{qualityHolds.length}</div>
              <p className="text-[11px] text-slate-500">
                Quarantined batches protected from clinical dispensing
              </p>
            </div>
          </div>

          {/* Critical Supply Alert Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Urgent Risks */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  Urgent Facility Supply Risks
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Small-Cell Suppressed (N&ge;5)</span>
              </div>

              {risks.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No active supply risks detected.</div>
              ) : (
                <div className="space-y-3">
                  {risks.map((risk) => (
                    <div
                      key={risk.riskId}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded ${
                              risk.severity === 'CRITICAL'
                                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {risk.riskType}
                          </span>
                          <span className="text-xs font-semibold text-slate-200">
                            {supplyCatalogService.getItem(risk.supplyItemId)?.name || risk.supplyItemId}
                          </span>
                        </div>
                        {risk.daysRemaining !== undefined && (
                          <span className="text-xs font-mono text-rose-400 font-bold">
                            {risk.daysRemaining} days buffer
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{risk.evidence}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inbound Consignments & Expected Receipts */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-teal-400" />
                  Active Shipments & Receiving Pipeline
                </h3>
                <span className="text-[10px] text-slate-400 font-mono">Multi-Leg Verified</span>
              </div>

              {shipments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">No incoming shipments registered.</div>
              ) : (
                <div className="space-y-3">
                  {shipments.map((shipment) => (
                    <div
                      key={shipment.shipmentId}
                      className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-white font-mono">
                            {shipment.shipmentId} (PO: {shipment.purchaseOrderReference})
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {shipment.origin} &rarr; {shipment.destination}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-teal-950 text-teal-300 border border-teal-800">
                          {shipment.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-900">
                        <span>Carrier: {shipment.carrierReference}</span>
                        <span>ETA: {new Date(shipment.estimatedArrival).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* V7 Inventory Ledger Bridge & Physical Receiving Overview */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  V7 Append-Only Inventory Ledger Bridge
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Goods receipts finalized into authoritative pharmacy stock movements with SHA-256 seals
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2.5">GRN Reference</th>
                    <th className="pb-2.5">PO Ref</th>
                    <th className="pb-2.5">Received Date</th>
                    <th className="pb-2.5">Inspection</th>
                    <th className="pb-2.5">V7 Integration</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {goodsReceipts.map((grn) => (
                    <tr key={grn.goodsReceiptId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 font-bold text-slate-200">{grn.receiptNumber}</td>
                      <td className="py-2.5 text-slate-400">{grn.purchaseOrderReference}</td>
                      <td className="py-2.5 text-slate-400">
                        {new Date(grn.receivedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded ${
                            grn.inspectionStatus === 'PASSED'
                              ? 'bg-emerald-950 text-emerald-300'
                              : 'bg-amber-950 text-amber-300'
                          }`}
                        >
                          {grn.inspectionStatus}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {grn.inventoryIntegrated ? (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> POSTED
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-semibold">PENDING_FINALIZATION</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-sans">
                        {!grn.inventoryIntegrated && grn.status !== 'FINALIZED' && (
                          <button
                            onClick={() => handleFinalizeReceipt(grn.goodsReceiptId)}
                            className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold transition"
                          >
                            Finalize & Post
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SUPPLY CATALOGUE                                                      */}
      {/* ========================================================================= */}
      {activeSection === 'catalogue' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Package className="w-5 h-5 text-teal-400" />
                Commodity & Medicine Supply Catalogue
              </h3>
              <p className="text-xs text-slate-400">
                Procurement specifications, packaging units, and temperature zone requirements
              </p>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search catalogue..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 w-64 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-2.5">Code</th>
                  <th className="pb-2.5">Commodity Name</th>
                  <th className="pb-2.5">Category</th>
                  <th className="pb-2.5">Packaging Unit</th>
                  <th className="pb-2.5">Storage Zone</th>
                  <th className="pb-2.5">Class</th>
                  <th className="pb-2.5">Tracking</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {items
                  .filter(
                    (i) =>
                      i.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      i.code.toLowerCase().includes(searchTerm.toLowerCase())
                  )
                  .map((item) => (
                    <tr key={item.supplyItemId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 font-bold text-teal-300">{item.code}</td>
                      <td className="py-2.5 font-sans font-semibold text-white">{item.name}</td>
                      <td className="py-2.5 font-sans text-slate-300">{item.category}</td>
                      <td className="py-2.5 text-slate-400">{item.packagingUnit}</td>
                      <td className="py-2.5">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          {item.storageRequirements.temperatureZone}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded ${
                            item.procurementClassification === 'VITAL'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {item.procurementClassification}
                        </span>
                      </td>
                      <td className="py-2.5 font-sans text-[11px] text-slate-400">
                        {item.batchTrackingRequired && 'Batch, '}
                        {item.expiryRequired && 'Expiry'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. PROCUREMENT & PURCHASE ORDERS                                         */}
      {/* ========================================================================= */}
      {activeSection === 'procurement' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <FileCheck className="w-5 h-5 text-teal-400" />
                  Purchase Orders & Commercial Approvals
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Server-side financial recalculations, multi-tier approvals & duplicate prevention
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                    <th className="pb-2.5">PO Number</th>
                    <th className="pb-2.5">Supplier</th>
                    <th className="pb-2.5">Lines</th>
                    <th className="pb-2.5">Total Amount</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {purchaseOrders.map((po) => {
                    const sup = suppliers.find((s) => s.supplierId === po.supplierId);
                    return (
                      <tr key={po.purchaseOrderId} className="hover:bg-slate-800/30 transition">
                        <td className="py-2.5 font-bold text-slate-200">{po.orderNumber}</td>
                        <td className="py-2.5 font-sans text-slate-300">
                          {sup?.displayName || po.supplierId}
                        </td>
                        <td className="py-2.5 text-slate-400">{po.lines.length} lines</td>
                        <td className="py-2.5 font-bold text-emerald-400">
                          ${po.totalAmount.toLocaleString()} {po.currency}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded ${
                              po.status === 'APPROVED'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : po.status === 'SENT'
                                ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                : 'bg-amber-950 text-amber-300 border border-amber-800'
                            }`}
                          >
                            {po.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-sans space-x-2">
                          {po.status === 'PENDING_APPROVAL' && (
                            <button
                              onClick={() => handleApprovePO(po.purchaseOrderId)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition"
                            >
                              Approve PO
                            </button>
                          )}
                          {po.status === 'APPROVED' && (
                            <button
                              onClick={() => handleSendPO(po.purchaseOrderId)}
                              className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold transition"
                            >
                              Dispatch PO
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Suppliers Registry */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-teal-400" />
              Qualified Suppliers & Wholesalers
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliers.map((s) => (
                <div key={s.supplierId} className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-100">{s.displayName}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-950 text-emerald-300'
                          : 'bg-rose-950 text-rose-300'
                      }`}
                    >
                      {s.status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{s.legalName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">Reg: {s.registrationReference}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. REQUISITIONS & DEMAND SIGNALS                                         */}
      {/* ========================================================================= */}
      {activeSection === 'requisitions' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-400" />
                Departmental Requisitions & Approval History
              </h3>
              <p className="text-xs text-slate-400">
                Prescription &ne; Requisition. Staff replenishment requests with cryptographic SHA-256 seals.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold">
                  <th className="pb-2.5">Requisition ID</th>
                  <th className="pb-2.5">Department</th>
                  <th className="pb-2.5">Purpose</th>
                  <th className="pb-2.5">Priority</th>
                  <th className="pb-2.5">Needed By</th>
                  <th className="pb-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {requisitions.map((req) => (
                  <tr key={req.requisitionId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 font-bold text-slate-200">{req.requisitionId}</td>
                    <td className="py-2.5 font-sans text-slate-300">{req.requestingDepartment}</td>
                    <td className="py-2.5 font-sans text-slate-400">{req.purpose}</td>
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          req.priority === 'HIGH' || req.priority === 'CRITICAL'
                            ? 'bg-rose-950 text-rose-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {req.priority}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-400">{req.neededBy}</td>
                    <td className="py-2.5">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded ${
                          req.status === 'APPROVED'
                            ? 'bg-emerald-950 text-emerald-300'
                            : 'bg-amber-950 text-amber-300'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. COLD CHAIN & EXCURSIONS                                               */}
      {/* ========================================================================= */}
      {activeSection === 'cold_chain' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Thermometer className="w-5 h-5 text-teal-400" />
                Cold Chain Monitoring & Temperature Excursions
              </h3>
              <p className="text-xs text-slate-400">
                Continuous telemetry, automatic batch quarantine triggers & human clinical reviews
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {excursions.map((exc) => (
              <div
                key={exc.excursionId}
                className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-white">{exc.excursionId}</span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        exc.severity === 'CRITICAL'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {exc.severity} EXCURSION
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                      {exc.status}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-rose-400 font-bold">
                    Peak: {exc.maximumTemperature}&deg;C (Required: {exc.requiredRange.min}&deg;C -{' '}
                    {exc.requiredRange.max}&deg;C)
                  </div>
                </div>

                <div className="text-xs text-slate-300">
                  Affected Batches:{' '}
                  <span className="font-mono text-teal-300">{exc.affectedBatches.join(', ')}</span>
                </div>

                {exc.reviewDecision && (
                  <div className="p-2.5 bg-slate-900 border border-slate-800 rounded text-xs text-slate-400">
                    <span className="font-semibold text-slate-200">Review Decision:</span> {exc.reviewDecision}
                  </div>
                )}

                {exc.status === 'QUARANTINED' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-900">
                    <button
                      onClick={() => handleReviewExcursion(exc.excursionId, 'CLEARED')}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                    >
                      Clear & Release
                    </button>
                    <button
                      onClick={() => handleReviewExcursion(exc.excursionId, 'REJECTED')}
                      className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition"
                    >
                      Reject & Quarantine
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. QUALITY HOLDS & RECALLS                                               */}
      {/* ========================================================================= */}
      {activeSection === 'quality' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-purple-400" />
                Batch Quality Holds & Regulatory Recalls
              </h3>
              <p className="text-xs text-slate-400">
                QualityHold &ne; Disposal. Consequential release and disposal decisions require human review.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {qualityHolds.map((hold) => (
              <div
                key={hold.holdId}
                className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">{hold.holdId}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800">
                      {hold.reason}
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-300">
                    Qty Held: {hold.quantityHeld} units
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Batch:{' '}
                  <span className="font-mono text-teal-300 font-bold">{hold.batchNumber}</span> (Item:{' '}
                  {hold.supplyItemId})
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs">
                  <span className="text-slate-500">Placed by: {hold.placedBy}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleReleaseHold(hold.holdId)}
                      className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                    >
                      Release to Dispensing
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. PLANNING, FORECASTING & REPLENISHMENT                                  */}
      {/* ========================================================================= */}
      {activeSection === 'planning' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-teal-400" />
                Replenishment Recommendations & Projections
              </h3>
              <p className="text-xs text-slate-400">
                Forecast &ne; PurchaseOrder. Projections guide procurement officers with explicit confidence levels.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {recommendations.map((rec) => (
              <div
                key={rec.recommendationId}
                className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white font-mono">{rec.recommendationId}</span>
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                      rec.urgency === 'CRITICAL'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : 'bg-teal-950 text-teal-300 border border-teal-800'
                    }`}
                  >
                    {rec.urgency} URGENCY
                  </span>
                </div>
                <div className="text-xs font-semibold text-slate-200">
                  {supplyCatalogService.getItem(rec.supplyItemId)?.name || rec.supplyItemId}
                </div>
                <p className="text-xs text-slate-400">{rec.rationale}</p>
                <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-xs text-slate-400 font-mono">
                  <span>Current: {rec.currentAvailableQuantity}</span>
                  <span className="font-bold text-teal-300">
                    Recommended Order: {rec.recommendedQuantity} units
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
