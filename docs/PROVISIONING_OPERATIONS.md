# Jano Health — Firestore Authorization Directory Provisioning Guide

## Operational Runbook & Security Handover

This document specifies the operational procedure for securely bootstrapping, provisioning, and maintaining Jano Health's persistent Cloud Firestore authorization directory across staging and production environments.

---

### 1. Architectural Overview & Collections

The authorization directory serves as the authoritative access control registry for all Jano Health tenants, facilities, user accounts, and synchronization capabilities.

Canonical Firestore collections:
- `directory_tenants/{tenantId}`: Tenant registration, status (`active` | `suspended`), policy metadata.
- `directory_facilities/{facilityId}`: Healthcare facility registry, owning `tenantId`, status (`active` | `decommissioned`).
- `directory_users/{uid}`: Global user identity records, `accountStatus` (`active` | `suspended` | `revoked`), `revocationVersion`.
- `directory_users/{uid}/tenant_memberships/{tenantId}`: User tenant assignment, roles, capabilities, `membershipVersion`.
- `directory_users/{uid}/tenant_memberships/{tenantId}/facility_memberships/{facilityId}`: User facility assignment, capabilities, `membershipVersion`.
- `directory_audit_logs/{logId}`: Immutable, in-transaction administrative audit logs.

---

### 2. Environment & IAM Prerequisites

#### 2.1 Firebase Project Configuration
- A dedicated Google Cloud / Firebase project configured with Cloud Firestore in Native Mode.
- Security Rules configured to deny client-direct access to all `directory_*` collections (server-authoritative access only via Firebase Admin SDK).

#### 2.2 Required Google Cloud IAM Permissions
The operational service account or operator running administrative CLI commands requires:
- `roles/datastore.user` (Cloud Datastore User): To execute transactional reads and writes against Firestore collections.
- `roles/firebaseauth.admin` (Firebase Authentication Admin): To verify and inspect user identities.
- `roles/serviceusage.serviceUsageConsumer`: To invoke Cloud APIs.

#### 2.3 Application Default Credentials (ADC) Setup
For local administrative operator workstations or deployment runners:
```bash
# 1. Authenticate Google Cloud operator identity
gcloud auth application-default login

# 2. Set active target project
gcloud config set project <TARGET_FIREBASE_PROJECT_ID>
export FIREBASE_PROJECT_ID=<TARGET_FIREBASE_PROJECT_ID>
```

---

### 3. First-Administrator Bootstrap Procedure

The bootstrap operation initializes the first root healthcare tenant and assigns the initial `system_administrator` operator account with `directory:provision` capability.

#### 3.1 Safety Invariants
- **Concurrency-Safe Singleton Lock**: Bootstrap acquires an Optimistic Concurrency Control (OCC) lock on `directory_system/bootstrap_marker`. Concurrent bootstrap attempts (even with divergent tenant or admin IDs) collide on this marker, ensuring strictly one execution can commit.
- **Empty Directory Guard**: Bootstrap refuses execution if the directory already contains any provisioned tenant or user account.
- **Authoritative Project Match Guard**: The CLI requires an explicit `--project-id` flag that MUST match the active Firebase Admin SDK project identity resolved from the environment.
- **Separation of Operator Attribution**: The bootstrap audit record strictly separates the physical operator / execution principal (e.g., `gcp_application_default_credentials`) from the newly created system administrator identity.
- **No Hardcoded Credentials**: Identities and tenant IDs must be explicitly passed by the operator.
- **Replay Protection**: Duplicate executions abort with `BOOTSTRAP_ALREADY_COMPLETED`.

#### 3.2 Executing Bootstrap
```bash
npx tsx scripts/provisionDirectory.ts bootstrap \
  --project-id=jano-health-prod \
  --tenant-id=tenant-prod-ea-moh \
  --admin-uid=usr-ops-admin-01 \
  --admin-email=ops-admin@janohealth.org \
  --operator-id=gcp-deployer-sa \
  --reason="Initial production deployment bootstrap"
```

---

### 4. Administrative Provisioning Workflows

All provisioning operations require authentication and explicit administrative authority.

**Operator Token Handling & Security**:
- **Strict In-Transit Credential Protection**: Passing bearer tokens via command-line arguments (`--operator-token`) or environment variables (`JANO_ADMIN_TOKEN`, `FIREBASE_AUTH_TOKEN`) exposes credentials to process table inspection (`ps aux`), shell histories, and subshell environments. In production mode, any attempt to use these mechanisms is rejected immediately with error code `INSECURE_OPERATOR_TOKEN_INPUT`.
- **Approved Credential Ingestion**:
  1. **Standard Input (`--token-stdin`)**: Pipe the token directly without writing it to disk or command arguments:
     ```bash
     cat /run/secrets/operator_token | npx tsx scripts/provisionDirectory.ts <command> --token-stdin ...
     ```
  2. **Interactive TTY Prompt**: When running in an interactive terminal without `--token-stdin`, the CLI prompts `Enter operator Firebase ID token: ` with terminal echo disabled via `readline`. Terminal state is safely restored upon completion, exit, or SIGINT.
- **Identity Anti-Spoofing**: The authenticated token identity is verified against `--actor-uid` to prevent identity spoofing (`OPERATOR_IDENTITY_MISMATCH` protection).

#### 4.1 Anti-Privilege Escalation Rules
- **Global Role Protection**: Role `system_administrator` can ONLY be granted or updated by active, verified global system administrators. The legacy `'system'` alias has been eliminated across all operational middleware and directory services. Scoped administrators attempting to assign global roles are rejected with `PRIVILEGE_ELEVATION_FORBIDDEN`.
- **Privileged Capability Protection**: Capabilities `directory:provision` and `sync:manage` can ONLY be granted or updated by global system administrators. Scoped administrators attempting to grant them are rejected with `CAPABILITY_ELEVATION_FORBIDDEN`.
- **Anti-Self-Provisioning**: Operators cannot grant themselves new memberships or change their own account status (`SELF_PROVISIONING_FORBIDDEN`).

#### 4.2 Provision a New Tenant (Global Administrator Only)
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts provision-tenant \
  --tenant-id=tenant-prod-tz-health \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Onboarding Tanzania National Health Authority"
```

#### 4.3 Provision a Healthcare Facility under a Tenant
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts provision-facility \
  --facility-id=fac-mwanza-regional-01 \
  --tenant-id=tenant-prod-tz-health \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Commissioning Mwanza Regional Hospital"
```

#### 4.4 Provision a User Account Record
User provisioning verifies that the account exists and is not disabled in Firebase Authentication before creating the directory record.
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts provision-user \
  --uid=usr-dr-amani \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Clinician credential verification approved"
```

#### 4.5 Assign Tenant Membership
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts create-tenant-membership \
  --uid=usr-dr-amani \
  --tenant-id=tenant-prod-tz-health \
  --roles=physician,clinician \
  --capabilities=sync:facility \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Staff onboarding to regional authority"
```

#### 4.6 Assign Facility Membership
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts create-facility-membership \
  --uid=usr-dr-amani \
  --tenant-id=tenant-prod-tz-health \
  --facility-id=fac-mwanza-regional-01 \
  --capabilities=sync:facility \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Primary facility deployment"
```

#### 4.7 Update Membership Roles or Capabilities
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts update-membership \
  --type=tenant \
  --uid=usr-dr-amani \
  --tenant-id=tenant-prod-tz-health \
  --roles=physician,clinical_supervisor \
  --capabilities=sync:facility,sync:cross_facility \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin \
  --reason="Promotion to district clinical supervisor"
```

---

### 5. Suspension and Revocation Procedures

#### 5.1 Suspend or Revoke a User Account
Suspension temporarily denies all operations across all tenants and facilities; revocation is permanent.
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts set-user-status \
  --uid=usr-dr-amani \
  --status=suspended \
  --reason="Routine security credential review" \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin
```

#### 5.2 Suspend or Revoke a Tenant or Facility Membership
```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts set-membership-status \
  --type=facility \
  --uid=usr-dr-amani \
  --tenant-id=tenant-prod-tz-health \
  --facility-id=fac-mwanza-regional-01 \
  --status=revoked \
  --reason="Transfer to different facility" \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin
```

---

### 6. Directory Inspection & Scoping Isolation

Directory inspection is strictly tenant- and facility-scoped:
- **Global Administrators**: Can inspect across all tenants, facilities, and audit logs.
- **Tenant Administrators**: Are strictly scoped to their own `tenantId`. Omitting `tenantId` defaults safely to the operator's tenant; specifying a different tenant returns `CROSS_TENANT_INSPECTION_FORBIDDEN`. All facility, membership, and audit queries are strictly filtered to the operator's tenant.
- **Facility Administrators**:
  - Restricted to their assigned facilities within their tenant.
  - When inspecting a user (`--uid=<uid>`), the target user MUST have an active facility membership within the operator's authorized facility scope.
  - If the user does not exist or has no active membership in the authorized facility, the API fails closed with `USER_NOT_FOUND_OR_UNAUTHORIZED` to prevent user enumeration attacks.
  - Account responses are data-minimized and only return permitted facility memberships; foreign tenant-level memberships and roles are omitted.

```bash
cat /run/secrets/admin_token | npx tsx scripts/provisionDirectory.ts inspect \
  --tenant-id=tenant-prod-tz-health \
  --audit-logs \
  --actor-uid=usr-ops-admin-01 \
  --token-stdin
```

---

### 7. Audit Logging Architecture & Failure Recovery

- **In-Transaction Co-Commitment for Successful Mutations**:
  - Every successful directory modification writes an immutable record in `directory_audit_logs/{logId}` inside the **exact same atomic Firestore transaction** as the directory document updates.
  - If audit persistence fails, the entire transaction rolls back via Firestore atomicity; untraced administrative actions are impossible.
- **Best-Effort Failure Logging**:
  - For failed or rejected administrative requests, failure events are logged with `status: 'FAILED'` outside the transaction so operational failures can be monitored without contaminating transactional integrity.
- **Staging vs Production Separation**:
  - In production mode (`NODE_ENV=production` or `VITE_AUTH_MODE=production`), all requests using development tokens or local development fixtures (`DEVELOPMENT_PRINCIPALS`) fail closed with HTTP 403 `DEVELOPMENT_PRINCIPALS_FORBIDDEN_IN_PRODUCTION`.
- **Operational Data Invariants**:
  - Directory provisioning operates exclusively on `directory_*` collections. It never accesses, alters, migrates, or deletes existing local server ledger files (`.server_ledger_*`).
