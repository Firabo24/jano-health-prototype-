/**
 * Jano Health - Clinical Core V7: Pharmacy Operations, Inventory & Dispensing Test Suite
 * 
 * Verifies:
 * 1. Offline Deterministic Pharmacy Identifiers (DSP-, RCV-, TRF-, WST- with Luhn-36 checksums)
 * 2. Transposition and mutation error detection via calculatePharmacyChecksum
 * 3. Inventory Receipt & FEFO Batch Selection
 * 4. Append-Only Inventory Ledger & Replay Consistency Verification
 * 5. Stock Wastage, Spoilage & Physical Count Adjustments
 * 6. Strict RBAC Enforcement (Pharmacist-only dispensing; AI strictly forbidden)
 * 7. End-to-End Atomic Dispense with Inventory Batch Stock Deduction
 * 8. Dispense Reversal & Stock Restoration
 */

import {
  calculatePharmacyChecksum,
  generateDispenseNumber,
  validateDispenseNumber,
  generateReceiptNumber,
  validateReceiptNumber,
  generateTransferNumber,
  validateTransferNumber,
  generateWastageNumber,
  validateWastageNumber,
} from '../src/domain/pharmacyIdentifiers';
import { inventoryService } from '../src/services/pharmacy/inventoryService';
import { medicationService } from '../src/services/clinical/medicationService';
import { patientService } from '../src/services/clinical/patientService';
import { ClinicalActorContext } from '../src/services/clinical/clinicalTransaction';
import { localRepository } from '../src/services/storage/localRepository';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

// Actors
const pharmacistKofi: ClinicalActorContext = {
  userId: 'usr_pharm_kofi',
  userName: 'Kofi Mensah, RPh',
  userRole: 'pharmacist',
  facilityId: 'AMGH-001',
  deviceId: 'dispensary-tab-01',
};

const doctorKwame: ClinicalActorContext = {
  userId: 'usr_doc_kwame',
  userName: 'Dr. Kwame Antwi',
  userRole: 'physician',
  facilityId: 'AMGH-001',
  deviceId: 'tablet-doc-01',
};

const aiActor: ClinicalActorContext = {
  userId: 'jano_ai_agent',
  userName: 'Jano Clinical AI Assistant',
  userRole: 'ai_assistant' as any,
  facilityId: 'AMGH-001',
  deviceId: 'ai-server-01',
};

async function runPharmacyTests() {
  console.log('=============================================================');
  console.log('JANO HEALTH - CLINICAL CORE V7: PHARMACY & INVENTORY TESTS');
  console.log('=============================================================\n');

  // =========================================================================
  // TEST 1: OFFLINE DETERMINISTIC IDENTIFIERS & LUHN-36 CHECKSUM
  // =========================================================================
  console.log('TEST 1: Offline Deterministic Identifiers & Luhn-36 Checksum...');

  const dsp1 = generateDispenseNumber('AMGH-001', 'dispensary-tab-01');
  const dsp2 = generateDispenseNumber('AMGH-001', 'dispensary-tab-01');
  const rcv1 = generateReceiptNumber('AMGH-001', 'dispensary-tab-01');
  const trf1 = generateTransferNumber('AMGH-001', 'dispensary-tab-01');
  const wst1 = generateWastageNumber('AMGH-001', 'dispensary-tab-01');

  assert(dsp1.startsWith('DSP-AMGH-'), `Dispense number starts with DSP-AMGH-: ${dsp1}`);
  assert(validateDispenseNumber(dsp1), `Generated dispense number passes validation: ${dsp1}`);
  assert(validateDispenseNumber(dsp2), `Subsequent dispense number passes validation: ${dsp2}`);
  assert(dsp1 !== dsp2, 'Sequential dispense numbers are distinct');

  assert(rcv1.startsWith('RCV-AMGH-'), `Receipt number starts with RCV-AMGH-: ${rcv1}`);
  assert(validateReceiptNumber(rcv1), `Receipt number passes validation: ${rcv1}`);

  assert(trf1.startsWith('TRF-AMGH-'), `Transfer number starts with TRF-AMGH-: ${trf1}`);
  assert(validateTransferNumber(trf1), `Transfer number passes validation: ${trf1}`);

  assert(wst1.startsWith('WST-AMGH-'), `Wastage number starts with WST-AMGH-: ${wst1}`);
  assert(validateWastageNumber(wst1), `Wastage number passes validation: ${wst1}`);

  // Transposition / corruption test
  const corruptDsp = dsp1.slice(0, -2) + (dsp1.slice(-2, -1) === 'A' ? 'B' : 'A') + dsp1.slice(-1);
  assert(!validateDispenseNumber(corruptDsp), `Mutated dispense number fails checksum validation: ${corruptDsp}`);

  const badChecksum = dsp1.slice(0, -1) + (dsp1.slice(-1) === 'Z' ? 'Y' : 'Z');
  assert(!validateDispenseNumber(badChecksum), `Altered checksum character is rejected: ${badChecksum}`);

  // =========================================================================
  // TEST 2: INVENTORY STOCK INTAKE (RECEIPT) & FEFO BATCH ALLOCATION
  // =========================================================================
  console.log('\nTEST 2: Inventory Receipt & FEFO Batch Allocation...');

  const facilityId = 'AMGH-001';
  const receipt = await inventoryService.recordReceipt(
    {
      facilityId,
      supplierName: 'National Essential Drug Programme',
      supplierId: 'SUP-NEDP-01',
      referenceDocument: 'WAYBILL-2026-8812',
      items: [
        {
          medicationDefinitionId: 'med_def_amox_500_cap',
          medicationCode: 'WHO-EML-AMOX-500-CAP',
          genericName: 'Amoxicillin',
          batchNumber: 'AMX-LOT-EARLY',
          expiryDate: '2026-12-31', // Expiring earlier
          quantity: 200,
          unit: 'capsule',
        },
        {
          medicationDefinitionId: 'med_def_amox_500_cap',
          medicationCode: 'WHO-EML-AMOX-500-CAP',
          genericName: 'Amoxicillin',
          batchNumber: 'AMX-LOT-LATER',
          expiryDate: '2028-06-30', // Expiring later
          quantity: 300,
          unit: 'capsule',
        },
      ],
    },
    pharmacistKofi
  );

  assert(receipt.id.startsWith('rcv_'), `Receipt ID minted: ${receipt.id}`);
  assert(receipt.items.length === 2, 'Receipt contains 2 batches');

  const invItems = await inventoryService.getInventoryItems(facilityId);
  const amoxItem = invItems.find((i) => i.medicationCode === 'WHO-EML-AMOX-500-CAP');
  assert(!!amoxItem, 'Amoxicillin InventoryItem created/located');

  const fefoBatches = await inventoryService.getAvailableBatchesFEFO(amoxItem!.id, facilityId);
  assert(fefoBatches.length >= 2, `Located ${fefoBatches.length} FEFO available batches`);
  assert(
    fefoBatches[0].batchNumber === 'AMX-LOT-EARLY',
    `FEFO strategy prioritized earlier expiry batch (${fefoBatches[0].batchNumber}, exp ${fefoBatches[0].expiryDate})`
  );

  // =========================================================================
  // TEST 3: INVENTORY LEDGER REPLAY CONSISTENCY
  // =========================================================================
  console.log('\nTEST 3: Inventory Ledger Replay Consistency...');

  const earlyBatch = fefoBatches.find((b) => b.batchNumber === 'AMX-LOT-EARLY')!;
  const auditResult = await inventoryService.verifyBatchLedgerConsistency(earlyBatch.id);
  assert(auditResult.consistent, `Batch ${earlyBatch.batchNumber} ledger perfectly reconciles (delta = 0)`);
  assert(auditResult.computedQuantity === 200, `Computed stock matches receipt quantity (200)`);

  // =========================================================================
  // TEST 4: STOCK WASTAGE & PHYSICAL COUNT ADJUSTMENTS
  // =========================================================================
  console.log('\nTEST 4: Stock Wastage & Adjustments...');

  const wastage = await inventoryService.recordWastage(
    {
      facilityId,
      inventoryItemId: amoxItem!.id,
      batchId: earlyBatch.id,
      quantity: 10,
      reason: 'DAMAGED',
      notes: 'Crushed box during unpacking',
    },
    pharmacistKofi
  );

  assert(wastage.wastageNumber.startsWith('WST-'), `Wastage record created: ${wastage.wastageNumber}`);
  const updatedEarly = await inventoryService.getBatch(earlyBatch.id);
  assert(updatedEarly!.quantityOnHand === 190, `Batch stock reduced by wastage quantity (190 remaining)`);

  const ledgerAfterWastage = await inventoryService.verifyBatchLedgerConsistency(earlyBatch.id);
  assert(ledgerAfterWastage.consistent, 'Ledger remains consistent after wastage movement');

  // Physical count adjustment
  const adjTxn = await inventoryService.adjustStock(
    {
      facilityId,
      inventoryItemId: amoxItem!.id,
      batchId: earlyBatch.id,
      physicalCount: 185,
      reason: 'Monthly inventory count discrepancy',
    },
    pharmacistKofi
  );

  assert(adjTxn.transactionType === 'ADJUSTMENT_OUT', 'Discrepancy registered as ADJUSTMENT_OUT transaction');
  const postAdjBatch = await inventoryService.getBatch(earlyBatch.id);
  assert(postAdjBatch!.quantityOnHand === 185, 'Batch stock updated to exact physical count (185)');

  const ledgerAfterAdj = await inventoryService.verifyBatchLedgerConsistency(earlyBatch.id);
  assert(ledgerAfterAdj.consistent, 'Ledger remains consistent after physical count adjustment');

  // =========================================================================
  // TEST 5: PHARMACY RBAC BOUNDARIES & AI DISALLOWANCE
  // =========================================================================
  console.log('\nTEST 5: Pharmacy RBAC Boundaries & AI Prohibition...');

  // Physician attempting to dispense directly
  let physicianDispenseBlocked = false;
  try {
    await medicationService.dispensePrescription(
      {
        prescriptionId: 'non_existent_rx',
        quantityDispensed: 10,
      },
      doctorKwame
    );
  } catch (err: any) {
    physicianDispenseBlocked = err.message.includes('Unauthorized') || err.message.includes('permission');
  }
  assert(physicianDispenseBlocked, 'Physician role is prohibited from pharmacy dispensing');

  // AI Assistant attempting to dispense
  let aiDispenseBlocked = false;
  try {
    await medicationService.dispensePrescription(
      {
        prescriptionId: 'non_existent_rx',
        quantityDispensed: 10,
      },
      aiActor
    );
  } catch (err: any) {
    aiDispenseBlocked = err.message.includes('prohibited') || err.message.includes('AI');
  }
  assert(aiDispenseBlocked, 'AI Agent is strictly prohibited from executing medication dispensing');

  // =========================================================================
  // TEST 6: END-TO-END CLINICAL DISPENSING WITH LEDGER DEDUCTION
  // =========================================================================
  console.log('\nTEST 6: End-to-End Clinical Dispensing Pipeline...');

  // 1. Create a Patient
  const regResult = await patientService.registerPatient(
    {
      id: doctorKwame.userId,
      fullName: doctorKwame.userName,
      role: doctorKwame.userRole as any,
      facilityId: doctorKwame.facilityId,
    },
    {
      givenName: 'Tigist',
      familyName: 'Bekele',
      dateOfBirth: '1991-04-12',
      sex: 'female',
      villageTown: 'Kebele 07',
      district: 'Woreda 03',
      registrationFacilityId: 'AMGH-001',
      allergiesSummary: [],
    }
  );
  assert(regResult.success && !!regResult.patient, 'Patient registered successfully for pharmacy test');
  const patient = regResult.patient!;

  // 2. Clinician Prescribes Amoxicillin
  const { order, prescription } = await medicationService.createOrderAndIssuePrescription(
    {
      patientId: patient.id,
      facilityId: 'AMGH-001',
      medicationDefinitionId: 'med_def_amox_500_cap',
      route: 'oral',
      dose: '500',
      doseUnit: 'mg',
      frequency: 'TID',
      durationValue: 7,
      quantity: 21,
      indication: 'Acute bacterial bronchitis',
      instructions: 'Take one capsule three times daily after meals for 7 days',
    },
    doctorKwame,
    {
      validityDays: 14,
    }
  );

  assert(prescription.status === 'ISSUED', `Prescription issued with number: ${prescription.prescriptionNumber}`);

  // 3. Pharmacist Reviews Prescription
  const reviewedRx = await medicationService.reviewPrescription(
    prescription.id,
    'APPROVED',
    'Prescription verified: correct dosing and no drug-drug interactions detected.',
    pharmacistKofi,
    {
      medicationMatch: true,
      doseRouteFrequencyVerified: true,
      safetyWarningsChecked: true,
      inventoryAvailable: true,
    }
  );

  assert(reviewedRx.pharmacyReviewStatus === 'APPROVED', 'Pharmacist clinical review approved');

  // 4. Pharmacist Dispenses Prescription (Quantity = 21)
  const stockBeforeDispense = (await inventoryService.getBatch(earlyBatch.id))!.availableQuantity;
  const dispensedRx = await medicationService.dispensePrescription(
    {
      prescriptionId: prescription.id,
      quantityDispensed: 21,
      batchId: earlyBatch.id,
      counselingNotes: 'Advised patient to complete the entire 7-day course.',
      counselingProvided: true,
    },
    pharmacistKofi
  );

  assert(dispensedRx.status === 'DISPENSED', 'Prescription status transitioned to DISPENSED');
  assert(dispensedRx.dispensedQuantity === 21, 'Dispensed quantity matches request (21)');

  const stockAfterDispense = (await inventoryService.getBatch(earlyBatch.id))!.availableQuantity;
  assert(
    stockAfterDispense === stockBeforeDispense - 21,
    `Inventory batch stock decreased by exactly 21 (from ${stockBeforeDispense} to ${stockAfterDispense})`
  );

  // Check DispenseRecord aggregate
  const dispenseRecords = await medicationService.getDispenseRecordsForPrescription(prescription.id);
  assert(dispenseRecords.length === 1, 'Authoritative DispenseRecord created');
  const dRecord = dispenseRecords[0];
  assert(validateDispenseNumber(dRecord.dispenseNumber), `DispenseRecord has valid DSP number: ${dRecord.dispenseNumber}`);
  assert(dRecord.batchNumber === earlyBatch.batchNumber, `DispenseRecord tracks physical batch: ${dRecord.batchNumber}`);
  assert(dRecord.quantityRemaining === 0, 'Zero quantity remaining on prescription');

  // Verify batch ledger consistency
  const ledgerPostDispense = await inventoryService.verifyBatchLedgerConsistency(earlyBatch.id);
  assert(ledgerPostDispense.consistent, 'Batch ledger is consistent following dispense transaction');

  // =========================================================================
  // TEST 7: DISPENSE REVERSAL & INVENTORY RESTORATION
  // =========================================================================
  console.log('\nTEST 7: Dispense Reversal & Stock Restoration...');

  const reversedRecord = await medicationService.reverseDispense(
    dRecord.id,
    'Patient allergic reaction discovered before leaving dispensary window',
    pharmacistKofi
  );

  assert(reversedRecord.status === 'REVERSED', 'DispenseRecord status updated to REVERSED');
  assert(!!reversedRecord.reversedAt, `Reversed at: ${reversedRecord.reversedAt}`);

  const stockAfterReversal = (await inventoryService.getBatch(earlyBatch.id))!.availableQuantity;
  assert(
    stockAfterReversal === stockBeforeDispense,
    `Inventory stock fully restored to original quantity (${stockAfterReversal})`
  );

  const revertedPrescription = await localRepository.getPrescription(prescription.id);
  assert(revertedPrescription!.status === 'ISSUED', 'Prescription status reverted to ISSUED');

  const ledgerPostReversal = await inventoryService.verifyBatchLedgerConsistency(earlyBatch.id);
  assert(ledgerPostReversal.consistent, 'Batch ledger reconciles after reversal transaction');

  // =========================================================================
  // RESULTS SUMMARY
  // =========================================================================
  console.log('\n=============================================================');
  console.log(`CLINICAL CORE V7 PHARMACY TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('=============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPharmacyTests().catch((err) => {
  console.error('Unhandled failure in Pharmacy Test Suite:', err);
  process.exit(1);
});
