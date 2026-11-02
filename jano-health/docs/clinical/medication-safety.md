# Clinical Domain: Medication Safety Engine

## 1. Overview
The `MedicationSafetyService` provides real-time clinical decision support (CDS) during medication order entry. It guards against preventable adverse drug events (ADEs), drug interactions, allergy cross-reactivities, and duplicate therapies.

## 2. Provenance & Knowledge Attribution
Every safety rule execution records complete regulatory and clinical metadata:
- `source`: Authoritative ruleset tag (e.g. `WHO-EML-SAFETY-RULES-2026`).
- `sourceVersion`: Ruleset release identifier (e.g. `2026.1-OFFLINE`).
- `jurisdiction`: Regulatory operational region (`GH-MOH / WHO-AFRO`).
- `effectiveDate`: Activation date of the medical rules.
- `ruleSetVersion`: Version of the evaluation logic (`2026.1`).
- `checkedAt`: Exact ISO timestamp of screening evaluation.

## 3. Knowledge Unavailable Fail-Safe
When candidate therapies or active regimens are outside known interaction matrices:
- Status explicitly resolves to `KNOWLEDGE_UNAVAILABLE`.
- Overall safety review state reflects `KNOWLEDGE_UNAVAILABLE` or `WARNING`.
- Never silently passes unknown compounds as "SAFE". Prescribers are explicitly alerted to exercise heightened clinical vigilance.

## 4. Multi-Factor Screening Dimensions
1. **Allergy & Cross-Reactivity**:
   - Beta-lactam / Penicillin cross-reactivity with cephalosporins and aminopenicillins.
   - Sulfonamide cross-reactivities (e.g., Co-trimoxazole, Sulfadoxine-Pyrimethamine).
2. **Drug-Drug Interactions (DDI)**:
   - High risk: Warfarin + NSAID (synergistic major GI bleeding risk).
   - High risk: ACE-Inhibitor (Lisinopril) + Potassium-Sparing Diuretics (hyperkalemia).
   - Moderate: Quinolone (Ciprofloxacin) + NSAID (seizure threshold lowering).
3. **Duplicate Therapy Detection**:
   - Simultaneous overlapping therapeutic classes (e.g., concurrent antimalarials, concurrent NSAIDs).
4. **Physiological Contraindications**:
   - Age thresholds (e.g., Aspirin in pediatric viral illness for Reye's syndrome risk; Ciprofloxacin in pediatric populations).
   - Pregnancy contraindications (e.g., ACE inhibitors in pregnancy).
5. **Dose & Duration Bounds**:
   - Intercepts extreme overdosing or prolonged courses exceeding therapeutic protocols.

## 5. Clinician Overrides & Attestation
- `CONTRAINDICATED` findings block order submission unless a licensed physician documents a formal clinical override (`ACKNOWLEDGE_AND_CONTINUE`) with written justification (e.g., desensitization protocol, emergency life-saving indication).
- Overrides are permanently bound to the clinician's identity and written into the tamper-evident audit ledger.
