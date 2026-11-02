/**
 * Jano Health - FHIR R5 Data Model & Resource Types
 * Strict typing for FHIR R5 (5.0.0) exchange structures.
 */

import { FHIR_VERSION } from './constants';

export type FHIRVersion = typeof FHIR_VERSION;

// ----------------------------------------------------
// Base Types & Datatypes
// ----------------------------------------------------

export interface Meta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: Coding[];
  tag?: Coding[];
}

export interface Extension {
  url: string;
  valueString?: string;
  valueBoolean?: boolean;
  valueInteger?: number;
  valueDecimal?: number;
  valueDateTime?: string;
  valueCode?: string;
  valueReference?: Reference;
  valueCodeableConcept?: CodeableConcept;
  valueQuantity?: Quantity;
  extension?: Extension[];
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: CodeableConcept;
  system?: string;
  value?: string;
  period?: Period;
  assigner?: Reference;
}

export interface Coding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Quantity {
  value?: number;
  comparator?: '<' | '<=' | '>=' | '>';
  unit?: string;
  system?: string;
  code?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Reference {
  reference?: string;
  type?: string;
  identifier?: Identifier;
  display?: string;
}

export interface HumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface ContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface Attachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

// ----------------------------------------------------
// Base Resource Contract
// ----------------------------------------------------

export interface Resource {
  resourceType: string;
  id?: string;
  meta?: Meta;
  implicitRules?: string;
  language?: string;
}

export interface DomainResource extends Resource {
  text?: {
    status: 'generated' | 'extensions' | 'additional' | 'empty';
    div: string;
  };
  contained?: Resource[];
  extension?: Extension[];
  modifierExtension?: Extension[];
}

// ----------------------------------------------------
// Core FHIR R5 Domain Resources
// ----------------------------------------------------

export interface FHIRPatient extends DomainResource {
  resourceType: 'Patient';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Address[];
  managingOrganization?: Reference;
}

export interface FHIREncounter extends DomainResource {
  resourceType: 'Encounter';
  identifier?: Identifier[];
  status:
    | 'planned'
    | 'in-progress'
    | 'on-hold'
    | 'discharged'
    | 'completed'
    | 'cancelled'
    | 'discontinued'
    | 'entered-in-error'
    | 'unknown';
  class?: CodeableConcept[];
  priority?: CodeableConcept;
  type?: CodeableConcept[];
  subject?: Reference;
  serviceProvider?: Reference;
  participant?: {
    type?: CodeableConcept[];
    actor?: Reference;
    period?: Period;
  }[];
  actualPeriod?: Period;
  plannedStartDate?: string;
  reason?: {
    use?: CodeableConcept[];
    value?: (CodeableConcept | Reference)[];
  }[];
  location?: {
    location: Reference;
    status?: 'planned' | 'active' | 'reserved' | 'completed';
    period?: Period;
  }[];
}

export interface FHIRPractitioner extends DomainResource {
  resourceType: 'Practitioner';
  identifier?: Identifier[];
  active?: boolean;
  name?: HumanName[];
  telecom?: ContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
}

export interface FHIRPractitionerRole extends DomainResource {
  resourceType: 'PractitionerRole';
  identifier?: Identifier[];
  active?: boolean;
  practitioner?: Reference;
  organization?: Reference;
  code?: CodeableConcept[];
  specialty?: CodeableConcept[];
  location?: Reference[];
  telecom?: ContactPoint[];
}

export interface FHIROrganization extends DomainResource {
  resourceType: 'Organization';
  identifier?: Identifier[];
  active?: boolean;
  type?: CodeableConcept[];
  name?: string;
  alias?: string[];
  telecom?: ContactPoint[];
  address?: Address[];
  partOf?: Reference;
}

export interface FHIRLocation extends DomainResource {
  resourceType: 'Location';
  identifier?: Identifier[];
  status?: 'active' | 'suspended' | 'inactive';
  name?: string;
  alias?: string[];
  description?: string;
  mode?: 'instance' | 'kind';
  type?: CodeableConcept[];
  telecom?: ContactPoint[];
  address?: Address[];
  managingOrganization?: Reference;
  partOf?: Reference;
}

export interface FHIRObservation extends DomainResource {
  resourceType: 'Observation';
  identifier?: Identifier[];
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  effectivePeriod?: Period;
  issued?: string;
  performer?: Reference[];
  valueQuantity?: Quantity;
  valueCodeableConcept?: CodeableConcept;
  valueString?: string;
  valueBoolean?: boolean;
  interpretation?: CodeableConcept[];
  note?: { text: string; time?: string; authorString?: string }[];
  bodySite?: CodeableConcept;
  referenceRange?: {
    low?: Quantity;
    high?: Quantity;
    type?: CodeableConcept;
    text?: string;
  }[];
  component?: {
    code: CodeableConcept;
    valueQuantity?: Quantity;
    valueCodeableConcept?: CodeableConcept;
    valueString?: string;
    interpretation?: CodeableConcept[];
  }[];
}

export interface FHIRCondition extends DomainResource {
  resourceType: 'Condition';
  identifier?: Identifier[];
  clinicalStatus: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  severity?: CodeableConcept;
  code: CodeableConcept;
  bodySite?: CodeableConcept[];
  subject: Reference;
  encounter?: Reference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: Reference;
  note?: { text: string }[];
}

export interface FHIRAllergyIntolerance extends DomainResource {
  resourceType: 'AllergyIntolerance';
  identifier?: Identifier[];
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  type?: CodeableConcept;
  category?: ('food' | 'medication' | 'environment' | 'biologic')[];
  criticality?: 'low' | 'high' | 'unable-to-assess';
  code: CodeableConcept;
  patient: Reference;
  encounter?: Reference;
  recordedDate?: string;
  recorder?: Reference;
  reaction?: {
    substance?: CodeableConcept;
    manifestation: CodeableConcept[];
    description?: string;
    severity?: 'mild' | 'moderate' | 'severe';
  }[];
}

export interface FHIRServiceRequest extends DomainResource {
  resourceType: 'ServiceRequest';
  identifier?: Identifier[];
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';
  intent: 'proposal' | 'plan' | 'directive' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  category?: CodeableConcept[];
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  code?: { concept?: CodeableConcept };
  subject: Reference;
  encounter?: Reference;
  occurrenceDateTime?: string;
  authoredOn?: string;
  requester?: Reference;
  performer?: Reference[];
  reason?: { concept?: CodeableConcept }[];
  specimen?: Reference[];
  supportingInfo?: Reference[];
  note?: { text: string }[];
}

export interface FHIRSpecimen extends DomainResource {
  resourceType: 'Specimen';
  identifier?: Identifier[];
  accessionIdentifier?: Identifier;
  status?: 'available' | 'unavailable' | 'unsatisfactory' | 'entered-in-error';
  type?: CodeableConcept;
  subject?: Reference;
  receivedTime?: string;
  collection?: {
    collector?: Reference;
    collectedDateTime?: string;
    bodySite?: CodeableConcept;
  };
  condition?: CodeableConcept[];
}

export interface FHIRDiagnosticReport extends DomainResource {
  resourceType: 'DiagnosticReport';
  identifier?: Identifier[];
  basedOn?: Reference[];
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject?: Reference;
  encounter?: Reference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: Reference[];
  resultsInterpreter?: Reference[];
  specimen?: Reference[];
  result?: Reference[];
  study?: Reference[];
  conclusion?: string;
  conclusionCode?: CodeableConcept[];
  presentedForm?: Attachment[];
}

export interface FHIRImagingStudy extends DomainResource {
  resourceType: 'ImagingStudy';
  identifier?: Identifier[];
  status: 'registered' | 'available' | 'cancelled' | 'entered-in-error' | 'unknown';
  modality?: CodeableConcept[];
  subject: Reference;
  encounter?: Reference;
  started?: string;
  basedOn?: Reference[];
  referrer?: Reference;
  interpreter?: Reference[];
  endpoint?: Reference[];
  numberOfSeries?: number;
  numberOfInstances?: number;
  procedure?: { concept?: CodeableConcept };
  description?: string;
  series?: {
    uid: string;
    number?: number;
    modality: CodeableConcept;
    description?: string;
    numberOfInstances?: number;
    bodySite?: { concept?: CodeableConcept };
    performer?: { actor: Reference }[];
  }[];
}

export interface FHIRMedication extends DomainResource {
  resourceType: 'Medication';
  identifier?: Identifier[];
  code?: CodeableConcept;
  status?: 'active' | 'inactive' | 'entered-in-error';
  doseForm?: CodeableConcept;
  totalVolume?: Quantity;
  ingredient?: {
    item: { concept?: CodeableConcept; reference?: Reference };
    isActive?: boolean;
    strengthQuantity?: Quantity;
  }[];
  batch?: {
    lotNumber?: string;
    expirationDate?: string;
  };
}

export interface FHIRMedicationRequest extends DomainResource {
  resourceType: 'MedicationRequest';
  identifier?: Identifier[];
  status: 'active' | 'on-hold' | 'ended' | 'stopped' | 'completed' | 'cancelled' | 'entered-in-error' | 'draft' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  medication: { concept?: CodeableConcept; reference?: Reference };
  subject: Reference;
  encounter?: Reference;
  authoredOn?: string;
  requester?: Reference;
  performer?: Reference[];
  reason?: { concept?: CodeableConcept }[];
  dosageInstruction?: {
    text?: string;
    timing?: { code?: CodeableConcept };
    route?: CodeableConcept;
    doseAndRate?: {
      doseQuantity?: Quantity;
    }[];
  }[];
  dispenseRequest?: {
    validityPeriod?: Period;
    numberOfRepeatsAllowed?: number;
    quantity?: Quantity;
    expectedSupplyDuration?: Quantity;
  };
  substitution?: {
    allowedBoolean?: boolean;
    reason?: CodeableConcept;
  };
}

export interface FHIRMedicationDispense extends DomainResource {
  resourceType: 'MedicationDispense';
  identifier?: Identifier[];
  basedOn?: Reference[];
  partOf?: Reference[];
  status: 'preparation' | 'in-progress' | 'cancelled' | 'on-hold' | 'completed' | 'entered-in-error' | 'stopped' | 'declined' | 'unknown';
  medication: { concept?: CodeableConcept; reference?: Reference };
  subject: Reference;
  encounter?: Reference;
  performer?: {
    function?: CodeableConcept;
    actor: Reference;
  }[];
  location?: Reference;
  authorizingPrescription?: Reference[];
  type?: CodeableConcept;
  quantity?: Quantity;
  daysSupply?: Quantity;
  whenPrepared?: string;
  whenHandedOver?: string;
  destination?: Reference;
  receiver?: Reference[];
  note?: { text: string }[];
  dosageInstruction?: {
    text?: string;
  }[];
  substitution?: {
    wasSubstituted: boolean;
    type?: CodeableConcept;
    reason?: CodeableConcept[];
    responsibleParty?: Reference;
  };
}

export interface FHIRCareTeam extends DomainResource {
  resourceType: 'CareTeam';
  identifier?: Identifier[];
  status?: 'proposed' | 'active' | 'suspended' | 'inactive' | 'entered-in-error';
  category?: CodeableConcept[];
  name?: string;
  subject?: Reference;
  period?: Period;
  participant?: {
    role?: CodeableConcept[];
    member?: Reference;
    onBehalfOf?: Reference;
    period?: Period;
  }[];
  managingOrganization?: Reference[];
}

export interface FHIRTask extends DomainResource {
  resourceType: 'Task';
  identifier?: Identifier[];
  status: 'draft' | 'requested' | 'received' | 'accepted' | 'rejected' | 'ready' | 'cancelled' | 'in-progress' | 'on-hold' | 'failed' | 'completed' | 'entered-in-error';
  intent: 'unknown' | 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  code?: CodeableConcept;
  description?: string;
  focus?: Reference;
  for?: Reference;
  encounter?: Reference;
  authoredOn?: string;
  lastModified?: string;
  requester?: Reference;
  owner?: Reference;
  note?: { text: string }[];
  output?: {
    type: CodeableConcept;
    valueReference?: Reference;
    valueString?: string;
  }[];
}

export interface FHIRDocumentReference extends DomainResource {
  resourceType: 'DocumentReference';
  identifier?: Identifier[];
  status: 'current' | 'superseded' | 'entered-in-error';
  type?: CodeableConcept;
  category?: CodeableConcept[];
  subject?: Reference;
  date?: string;
  author?: Reference[];
  description?: string;
  content: {
    attachment: Attachment;
    profile?: { concept?: CodeableConcept }[];
  }[];
}

export interface FHIRProvenance extends DomainResource {
  resourceType: 'Provenance';
  target: Reference[];
  occurredDateTime?: string;
  recorded: string;
  policy?: string[];
  location?: Reference;
  authorization?: CodeableReference[];
  activity?: CodeableConcept;
  agent: {
    type?: CodeableConcept;
    role?: CodeableConcept[];
    who: Reference;
    onBehalfOf?: Reference;
  }[];
  entity?: {
    role: 'revision' | 'quotation' | 'source' | 'instantiates' | 'removal';
    what: Reference;
  }[];
  signature?: {
    type?: Coding[];
    when: string;
    who: Reference;
    sigFormat?: string;
    data?: string;
  }[];
}

export interface CodeableReference {
  concept?: CodeableConcept;
  reference?: Reference;
}

export interface Money {
  value?: number;
  currency?: string;
}

export interface FHIRConsent extends DomainResource {
  resourceType: 'Consent';
  identifier?: Identifier[];
  status: 'draft' | 'active' | 'inactive' | 'not-done' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept[];
  subject?: Reference;
  date?: string;
  period?: Period;
  grantor?: Reference[];
  grantee?: Reference[];
  decision?: 'deny' | 'permit';
  provision?: {
    period?: Period;
    purpose?: Coding[];
    actor?: {
      role?: CodeableConcept;
      reference?: Reference;
    }[];
    action?: CodeableConcept[];
    code?: CodeableConcept[];
  };
}

export interface FHIRCoverage extends DomainResource {
  resourceType: 'Coverage';
  identifier?: Identifier[];
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  kind?: 'insurance' | 'self-pay' | 'other';
  beneficiary: Reference;
  period?: Period;
  insurer?: Reference;
  class?: {
    type: CodeableConcept;
    value: Identifier;
    name?: string;
  }[];
}

export interface FHIRClaim extends DomainResource {
  resourceType: 'Claim';
  identifier?: Identifier[];
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  type: CodeableConcept;
  use: 'claim' | 'preauthorization' | 'predetermination';
  patient: Reference;
  created: string;
  insurer?: Reference;
  provider: Reference;
  insurance: {
    sequence: number;
    focal: boolean;
    coverage: Reference;
  }[];
  item?: {
    sequence: number;
    productOrService?: CodeableConcept;
    unitPrice?: Money;
    net?: Money;
  }[];
  total?: Money;
}

export interface FHIRClaimResponse extends DomainResource {
  resourceType: 'ClaimResponse';
  identifier?: Identifier[];
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  type: CodeableConcept;
  use: 'claim' | 'preauthorization' | 'predetermination';
  patient: Reference;
  created: string;
  insurer: Reference;
  outcome: 'queued' | 'complete' | 'error' | 'partial';
  adjudication?: {
    category: CodeableConcept;
    amount?: Money;
  }[];
}

export interface FHIRInvoice extends DomainResource {
  resourceType: 'Invoice';
  identifier?: Identifier[];
  status: 'draft' | 'issued' | 'balanced' | 'cancelled' | 'entered-in-error';
  subject?: Reference;
  date?: string;
  totalNet?: Money;
  totalGross?: Money;
  lineItem?: {
    sequence: number;
    chargeItemCodeableConcept?: CodeableConcept;
    priceComponent?: {
      amount?: Money;
    }[];
  }[];
}

export interface FHIRPaymentNotice extends DomainResource {
  resourceType: 'PaymentNotice';
  identifier?: Identifier[];
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  request?: Reference;
  response?: Reference;
  created: string;
  reporter?: Reference;
  payment?: Reference;
  paymentDate?: string;
  payee?: Reference;
  recipient: Reference;
  amount: Money;
  paymentStatus?: CodeableConcept;
}

export interface FHIRAccount extends DomainResource {
  resourceType: 'Account';
  identifier?: Identifier[];
  status: 'active' | 'inactive' | 'entered-in-error' | 'on-hold' | 'unknown';
  type?: CodeableConcept;
  name?: string;
  subject?: Reference[];
  servicePeriod?: Period;
  coverage?: {
    coverage: Reference;
    priority?: number;
  }[];
  owner?: Reference;
  description?: string;
  calculatedAt?: string;
  balance?: {
    aggregate?: Money;
    term?: CodeableConcept;
    estimate?: boolean;
  }[];
}

export interface FHIRExplanationOfBenefit extends DomainResource {
  resourceType: 'ExplanationOfBenefit';
  identifier?: Identifier[];
  status: 'active' | 'cancelled' | 'draft' | 'entered-in-error';
  type: CodeableConcept;
  use: 'claim' | 'preauthorization' | 'predetermination';
  patient: Reference;
  created: string;
  insurer: Reference;
  provider: Reference;
  outcome: 'queued' | 'complete' | 'error' | 'partial';
  claim?: Reference;
  insurance: {
    focal: boolean;
    coverage: Reference;
  }[];
  total?: {
    category: CodeableConcept;
    amount: Money;
  }[];
  adjudication?: {
    category: CodeableConcept;
    amount?: Money;
  }[];
}

export interface FHIRAuditEvent extends DomainResource {
  resourceType: 'AuditEvent';
  type: CodeableConcept;
  subtype?: CodeableConcept[];
  action?: 'C' | 'R' | 'U' | 'D' | 'E';
  severity?: 'emergency' | 'alert' | 'critical' | 'error' | 'warning' | 'notice' | 'informational' | 'debug';
  occurredDateTime: string;
  recorded: string;
  outcome?: {
    code: Coding;
    detail?: CodeableConcept[];
  };
  agent: {
    type?: CodeableConcept;
    role?: CodeableConcept[];
    who?: Reference;
    requestor?: boolean;
  }[];
  source: {
    site?: Reference;
    observer: Reference;
    type?: CodeableConcept[];
  };
  entity?: {
    what?: Reference;
    role?: CodeableConcept;
    securityLabel?: CodeableConcept[];
    query?: string;
    detail?: {
      type: CodeableConcept;
      valueString?: string;
    }[];
  }[];
}

// ----------------------------------------------------
// Bundle & OperationOutcome
// ----------------------------------------------------

export interface FHIRBundleEntry {
  fullUrl?: string;
  resource?: Resource;
  request?: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    url: string;
    ifNoneMatch?: string;
    ifMatch?: string;
    ifNoneExist?: string;
  };
  response?: {
    status: string;
    location?: string;
    etag?: string;
    lastModified?: string;
    outcome?: Resource;
  };
}

export interface FHIRBundle extends Resource {
  resourceType: 'Bundle';
  type:
    | 'document'
    | 'message'
    | 'transaction'
    | 'transaction-response'
    | 'batch'
    | 'batch-response'
    | 'history'
    | 'searchset'
    | 'collection';
  timestamp?: string;
  total?: number;
  link?: {
    relation: 'self' | 'next' | 'previous' | 'first' | 'last';
    url: string;
  }[];
  entry?: FHIRBundleEntry[];
}

export interface FHIROperationOutcomeIssue {
  severity: 'fatal' | 'error' | 'warning' | 'information';
  code:
    | 'invalid'
    | 'security'
    | 'processing'
    | 'transient'
    | 'informational'
    | 'not-supported'
    | 'duplicate'
    | 'not-found'
    | 'conflict'
    | 'too-costly'
    | 'business-rule'
    | 'forbidden';
  details?: CodeableConcept;
  diagnostics?: string;
  location?: string[];
  expression?: string[];
}

export interface FHIROperationOutcome extends DomainResource {
  resourceType: 'OperationOutcome';
  issue: FHIROperationOutcomeIssue[];
}

// ----------------------------------------------------
// CapabilityStatement
// ----------------------------------------------------

export interface FHIRCapabilityStatementRestResource {
  type: string;
  profile?: string;
  interaction: {
    code: 'read' | 'vread' | 'update' | 'patch' | 'delete' | 'history-instance' | 'history-type' | 'create' | 'search-type';
    documentation?: string;
  }[];
  versioning?: 'no-version' | 'versioned' | 'versioned-update';
  readHistory?: boolean;
  updateCreate?: boolean;
  conditionalCreate?: boolean;
  conditionalRead?: 'not-supported' | 'modified-since' | 'not-match' | 'full-support';
  conditionalUpdate?: boolean;
  conditionalDelete?: 'not-supported' | 'single' | 'multiple';
  searchParam?: {
    name: string;
    type: 'number' | 'date' | 'string' | 'token' | 'reference' | 'composite' | 'quantity' | 'uri' | 'special';
    documentation?: string;
  }[];
}

export interface FHIRCapabilityStatement extends DomainResource {
  resourceType: 'CapabilityStatement';
  url: string;
  version: string;
  name: string;
  title: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  experimental: boolean;
  date: string;
  publisher: string;
  kind: 'instance' | 'capability' | 'requirements';
  software?: {
    name: string;
    version: string;
    releaseDate?: string;
  };
  fhirVersion: string;
  format: string[];
  rest: {
    mode: 'server' | 'client';
    documentation?: string;
    security?: {
      cors?: boolean;
      service?: CodeableConcept[];
      description?: string;
    };
    resource: FHIRCapabilityStatementRestResource[];
    interaction?: {
      code: 'transaction' | 'batch' | 'search-system' | 'history-system';
    }[];
  }[];
}

// ----------------------------------------------------
// Identity Reconciliation & Terminology Types
// ----------------------------------------------------

export type IdentityMatchStatus =
  | 'MATCH_CONFIRMED'
  | 'MATCH_CANDIDATE'
  | 'NO_MATCH'
  | 'IDENTITY_CONFLICT'
  | 'PENDING_REVIEW'
  | 'PENDING_IDENTITY_RECONCILIATION';

export interface IdentityReconciliationResult {
  status: IdentityMatchStatus;
  localPatientId?: string;
  confidenceScore: number;
  matchedFields: string[];
  conflictReasons?: string[];
  requiresManualReview: boolean;
  provenanceSource: string;
  autoMergeAllowed: boolean;
}

export interface TerminologyMappingResult {
  sourceSystem: string;
  sourceCode: string;
  targetSystem: string;
  targetCode?: string;
  display?: string;
  status: 'EXACT_MATCH' | 'EXACT' | 'BROADER' | 'NARROWER' | 'EQUIVALENT' | 'UNMAPPED';
  version?: string;
}

export interface FHIRSupplyRequest extends DomainResource {
  resourceType: 'SupplyRequest';
  identifier?: Identifier[];
  status?: 'draft' | 'active' | 'suspended' | 'cancelled' | 'completed' | 'entered-in-error' | 'unknown';
  category?: CodeableConcept;
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  itemCodeableConcept?: CodeableConcept;
  quantity: {
    value: number;
    unit?: string;
  };
  occurrenceDateTime?: string;
  authoredOn?: string;
  requester?: Reference;
  supplier?: Reference[];
  deliverTo?: Reference;
}

export interface FHIRSupplyDelivery extends DomainResource {
  resourceType: 'SupplyDelivery';
  identifier?: Identifier[];
  basedOn?: Reference[];
  status?: 'in-progress' | 'completed' | 'abandoned' | 'entered-in-error';
  type?: CodeableConcept;
  suppliedItem?: {
    quantity?: {
      value: number;
      unit?: string;
    };
    itemCodeableConcept?: CodeableConcept;
    itemReference?: Reference;
  };
  occurrenceDateTime?: string;
  destination?: Reference;
  receiver?: Reference[];
}

export interface FHIRResearchStudy extends DomainResource {
  resourceType: 'ResearchStudy';
  identifier?: Identifier[];
  title?: string;
  status: 'draft' | 'active' | 'completed' | 'temporarily-closed-to-accrual' | 'administratively-completed' | 'approved' | 'in-review';
  primaryPurposeType?: CodeableConcept;
  principalInvestigator?: Reference;
  site?: Reference[];
  description?: string;
}

export interface FHIRResearchSubject extends DomainResource {
  resourceType: 'ResearchSubject';
  identifier?: Identifier[];
  status: 'draft' | 'active' | 'retired' | 'candidate' | 'ineligible' | 'enrolled' | 'withdrawn';
  study: Reference;
  subject: Reference;
  assignedArm?: string;
  actualArm?: string;
  consent?: Reference;
}

export interface FHIREvidenceVariable extends DomainResource {
  resourceType: 'EvidenceVariable';
  identifier?: Identifier[];
  name?: string;
  title?: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  actual?: boolean;
  characteristic?: {
    description?: string;
    definitionCodeableConcept?: CodeableConcept;
  }[];
}

export interface FHIREvidence extends DomainResource {
  resourceType: 'Evidence';
  identifier?: Identifier[];
  title?: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  variableDefinition?: {
    description?: string;
    variableRole: CodeableConcept;
    observed?: Reference;
  }[];
  statistic?: {
    description?: string;
    sampleSize?: {
      numberOfParticipants?: number;
    };
  }[];
  certainty?: {
    type?: CodeableConcept;
    rating?: CodeableConcept;
  }[];
}

export interface FHIRCitation extends DomainResource {
  resourceType: 'Citation';
  identifier?: Identifier[];
  title?: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  citedArtifact?: {
    title?: { text: string }[];
    publicationForm?: {
      publishedDate?: string;
    };
  };
}
