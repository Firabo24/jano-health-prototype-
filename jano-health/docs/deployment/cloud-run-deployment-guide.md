# Jano Health — Cloud Run Deployment & Probes Guide

## 1. Overview
Jano Health is designed to run in containerized environments including Google Cloud Run. This guide documents the container execution contract, startup probe, liveness probe, readiness probe, and persistence constraints.

---

## 2. Platform Environment & Port Contract
- **Listening Port:** Cloud Run injects the `PORT` environment variable (typically `8080`).
- **Listener Implementation:** `server.ts` resolves `PORT` via `server/portConfig.ts` (`resolveServerPort()`), binds to `0.0.0.0`, and strictly validates that `PORT` is an integer between 1 and 65535.
- **Environment Markers:** Cloud Run provides `K_SERVICE`, `K_REVISION`, and `K_CONFIGURATION`. The server uses these markers to identify execution on Cloud Run.

---

## 3. Liveness vs. Readiness Probes

### 3.1 Liveness Probe (`/api/health`)
- **Path:** `/api/health`
- **Method:** `GET`
- **Purpose:** Verifies that the Node.js / Express process is alive, unblocked, and capable of responding to HTTP requests.
- **Response:** HTTP 200 with `{ status: "ok", system: "Jano Health EHR Platform", ... }`.
- **Privacy:** Returns zero patient identifiers, clinical payloads, or credentials.
- **Cloud Run Probe Example:**
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 15
  timeoutSeconds: 3
  failureThreshold: 3
```

### 3.2 Readiness Probe (`/api/ready`)
- **Path:** `/api/ready`
- **Method:** `GET`
- **Purpose:** Evaluates whether the instance is authorized and safe to serve authoritative persistence-dependent traffic.
- **Evaluation Criteria:**
  1. **Persistence Backend Safety:** Evaluates whether the configured persistence backend is shared-durable across Cloud Run instances.
     - *Current State:* The backend uses instance-local filesystem persistence (`server/serverLedger.ts`). Because Cloud Run instances have ephemeral, isolated filesystems and scale horizontally, local persistence is **not safe** for multi-instance replication.
     - *Result on Cloud Run:* Returns **HTTP 503** with `error: "PERSISTENCE_NOT_DURABLE_FOR_CLOUD_RUN"`.
  2. **Ledger Operational State:** Evaluates `serverLedger.getOperationalState()`.
     - `NORMAL`: Ready for local single-process development (returns HTTP 200).
     - `RECOVERY_REQUIRED`: Restored from backup/journal; returns **HTTP 503** until administrative reconciliation.
     - `RECOVERY_BLOCKED`: Both primary and backup corrupted; returns **HTTP 503**.
- **Cloud Run Probe Example:**
```yaml
readinessProbe:
  httpGet:
    path: /api/ready
    port: 8080
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 2
```

### 3.3 Startup Probe
```yaml
startupProbe:
  httpGet:
    path: /api/health
    port: 8080
  initialDelaySeconds: 2
  periodSeconds: 5
  failureThreshold: 12
```

---

## 4. Cloud Run Synchronization Guard
When Cloud Run is detected via `K_SERVICE`:
- Routes that read or mutate the authoritative server ledger (`/api/sync/push`, `/api/sync/pull`, `/api/sync/reset`, `/api/sync/recovery/reconcile`) are protected by `guardCloudRunSyncPersistence`.
- If only instance-local filesystem persistence is active, requests to these endpoints are rejected with **HTTP 503** (`UNSAFE_CLOUD_RUN_PERSISTENCE`, `PERSISTENCE_NOT_SHARED_DURABLE`).
- This fail-closed protection guarantees that split-brain mutations, dropped events, and out-of-order sequences cannot occur on Cloud Run prior to the implementation of the shared durable server-ledger backend (Google Cloud Firestore).

---

## 5. Deployment Packaging & Release Preflight
Before deploying or packaging containers:
1. Verify ignore rules:
   - `.gitignore` must exclude `.server_ledger_*` and `*.corrupted.*`.
   - `.dockerignore` must exclude `.server_ledger_*`, `*.corrupted.*`, and secret-bearing files.
2. Run the release preflight script:
   ```bash
   npm run check:release-artifacts
   ```
3. Ensure no local ledger files from development are committed or bundled into the container image layer.
