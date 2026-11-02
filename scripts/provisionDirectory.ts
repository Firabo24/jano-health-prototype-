#!/usr/bin/env tsx
/**
 * Jano Health - Authoritative Directory Provisioning CLI
 * 
 * Secure administrative command-line utility for managing Jano Health's
 * Firestore Authorization Directory in staging and production environments.
 * 
 * Usage:
 *   npx tsx scripts/provisionDirectory.ts bootstrap --project-id=<id> --tenant-id=<id> --admin-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts provision-tenant --tenant-id=<id> --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts provision-facility --facility-id=<id> --tenant-id=<id> --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts provision-user --uid=<uid> --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts create-tenant-membership --uid=<uid> --tenant-id=<id> --roles=clinician --capabilities=sync:facility --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts create-facility-membership --uid=<uid> --tenant-id=<id> --facility-id=<id> --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts update-membership --type=tenant --uid=<uid> --tenant-id=<id> --roles=supervisor --capabilities=sync:facility,sync:cross_facility --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts set-user-status --uid=<uid> --status=suspended --reason="Audit pending" --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts set-membership-status --type=tenant --uid=<uid> --tenant-id=<id> --status=revoked --reason="Resigned" --actor-uid=<uid>
 *   npx tsx scripts/provisionDirectory.ts inspect [--tenant-id=<id>] [--facility-id=<id>] [--uid=<uid>] [--audit-logs] --actor-uid=<uid>
 * 
 * Safety & Security:
 * - Requires explicit operator-controlled CLI execution with Application Default Credentials (ADC).
 * - Refuses execution if expected project ID does not match active Firebase environment.
 * - Enforces server-authoritative directory checks before any write.
 * - Atomically logs all mutations to directory_audit_logs.
 * - Replay prevention on bootstrap.
 */

import fs from 'fs';
import readline from 'readline';
import {
  getDirectoryProvisioningService,
  AdministrativeOperator,
} from '../server/directoryProvisioning';
import { getAuthorizationDirectory } from '../server/authorizationDirectory';
import { getFirebaseAdminApp, isProductionMode } from '../server/authMiddleware';

/**
 * Resolves Google Cloud execution principal and verification status.
 * FINDING-02: Unvalidated client_email from environment or credentials JSON is NOT cryptographically
 * verified; it is attributed as unverified metadata (verified: false) with explicit credential source.
 */
export function resolveExecutionPrincipal(): { principal: string; verified: boolean; credentialSource: string } {
  // 1. Check from FIREBASE_SERVICE_ACCOUNT environment variable (unverified JSON metadata)
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (parsed.client_email && typeof parsed.client_email === 'string') {
        return {
          principal: parsed.client_email.trim(),
          verified: false,
          credentialSource: 'unverified_service_account_env',
        };
      }
    } catch {
      // fallback
    }
  }

  // 2. Check from GOOGLE_APPLICATION_CREDENTIALS file (unverified JSON metadata)
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      if (fs.existsSync(process.env.GOOGLE_APPLICATION_CREDENTIALS)) {
        const fileContent = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
        const parsed = JSON.parse(fileContent);
        if (parsed.client_email && typeof parsed.client_email === 'string') {
          return {
            principal: parsed.client_email.trim(),
            verified: false,
            credentialSource: 'unverified_google_application_credentials_file',
          };
        }
      }
    } catch {
      // fallback
    }
  }

  // 3. Environment fallbacks (unverified attribution)
  if (process.env.GOOGLE_SERVICE_ACCOUNT && process.env.GOOGLE_SERVICE_ACCOUNT.trim()) {
    return {
      principal: process.env.GOOGLE_SERVICE_ACCOUNT.trim(),
      verified: false,
      credentialSource: 'google_service_account_env',
    };
  }

  if (process.env.GCLOUD_ACCOUNT && process.env.GCLOUD_ACCOUNT.trim()) {
    return {
      principal: process.env.GCLOUD_ACCOUNT.trim(),
      verified: false,
      credentialSource: 'gcloud_account_env',
    };
  }

  return {
    principal: 'gcp_application_default_credentials',
    verified: false,
    credentialSource: 'application_default_credentials',
  };
}

function parseArgs(args: string[]): { command: string; options: Record<string, string | boolean> } {
  const command = args[0] || 'help';
  const options: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        const key = arg.substring(2, eqIdx);
        const val = arg.substring(eqIdx + 1);
        options[key] = val;
      } else {
        const key = arg.substring(2);
        options[key] = true;
      }
    }
  }

  return { command, options };
}

function printUsage(): void {
  console.log(`
================================================================================
JANO HEALTH - PRODUCTION DIRECTORY PROVISIONING CLI
================================================================================

Commands:

1. bootstrap
   Initializes the first root tenant and system administrator account.
   Requires: --project-id=<id> --tenant-id=<id> --admin-uid=<uid>
   Optional: --admin-email=<email> --reason=<reason>

2. provision-tenant
   Provisions a new healthcare tenant.
   Requires: --tenant-id=<id> --actor-uid=<uid>
   Optional: --reason=<reason>

3. provision-facility
   Provisions a healthcare facility under an existing tenant.
   Requires: --facility-id=<id> --tenant-id=<id> --actor-uid=<uid>
   Optional: --reason=<reason>

4. provision-user
   Provisions a directory user account record.
   Requires: --uid=<uid> --actor-uid=<uid>
   Optional: --reason=<reason>

5. create-tenant-membership
   Assigns a user to an active tenant with roles and capabilities.
   Requires: --uid=<uid> --tenant-id=<id> --roles=<r1,r2> --capabilities=<c1,c2> --actor-uid=<uid>
   Optional: --reason=<reason>

6. create-facility-membership
   Assigns a user to an active facility under a tenant.
   Requires: --uid=<uid> --tenant-id=<id> --facility-id=<id> --actor-uid=<uid>
   Optional: --capabilities=<c1,c2> --reason=<reason>

7. update-membership
   Updates roles or capabilities of an existing membership.
   Requires: --type=<tenant|facility> --uid=<uid> --tenant-id=<id> --actor-uid=<uid>
   Optional: --facility-id=<id> --roles=<r1,r2> --capabilities=<c1,c2> --reason=<reason>

8. set-user-status
   Updates user account status (active, suspended, revoked).
   Requires: --uid=<uid> --status=<active|suspended|revoked> --reason=<reason> --actor-uid=<uid>

9. set-membership-status
   Updates tenant or facility membership status (active, suspended, revoked).
   Requires: --type=<tenant|facility> --uid=<uid> --tenant-id=<id> --status=<active|suspended|revoked> --reason=<reason> --actor-uid=<uid>
   Optional: --facility-id=<id> (required if type=facility)

10. inspect
    Inspects directory records, facilities, memberships, and audit logs.
    Optional: --tenant-id=<id> --facility-id=<id> --uid=<uid> --audit-logs --actor-uid=<uid>

Security & Operator Authentication (Commands 2-10):
    Requires: --actor-uid=<uid>
    In production mode:
      --token-stdin       Read operator Firebase ID token from piped stdin.
      Interactive prompt  Prompt with muted terminal echo (if connected to TTY).
      (Note: --operator-token and environment variables are rejected with INSECURE_OPERATOR_TOKEN_INPUT)
================================================================================
`);
}

/**
 * Reads operator token from stdin until EOF (supports piping, e.g. cat token.txt | script --token-stdin).
 */
export function readTokenFromStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      return reject(new Error('STDIN_IS_TTY: --token-stdin specified, but stdin is an interactive terminal. Pipe the token via stdin or use interactive prompt.'));
    }
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.trim());
    });
    process.stdin.on('error', (err) => {
      reject(new Error(`FAILED_READING_STDIN: ${err.message}`));
    });
  });
}

/**
 * Securely prompts the operator for their Firebase ID token via interactive TTY with echo muted.
 * Ensures terminal state is restored on completion, exit, or SIGINT.
 */
export function readTokenInteractive(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      return reject(new Error('INTERACTIVE_PROMPT_UNAVAILABLE: Stdin is not a TTY. Use --token-stdin to pipe credentials.'));
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    const restoreTerminal = () => {
      try {
        if (process.stdin.isTTY && process.stdin.setRawMode) {
          process.stdin.setRawMode(false);
        }
      } catch {}
    };

    const cleanup = () => {
      restoreTerminal();
      process.removeListener('SIGINT', onSigint);
      process.removeListener('exit', cleanup);
    };

    const onSigint = () => {
      cleanup();
      process.stdout.write('\n');
      process.exit(130);
    };

    process.on('SIGINT', onSigint);
    process.on('exit', cleanup);

    // Mute terminal echo while typing to protect secret
    (rl as any)._writeToOutput = function _writeToOutput() {};

    process.stdout.write('Enter operator Firebase ID token: ');

    rl.question('', (answer) => {
      cleanup();
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

/**
 * Resolves operator token securely according to environment and flags.
 * FINDING-01: In production mode, rejects command-line arguments (--operator-token) and environment
 * variables (JANO_ADMIN_TOKEN, FIREBASE_AUTH_TOKEN) with error code INSECURE_OPERATOR_TOKEN_INPUT.
 * Enforces --token-stdin or interactive prompt.
 */
export async function resolveOperatorToken(options: Record<string, string | boolean>): Promise<string | undefined> {
  const isProd = isProductionMode() || Boolean(options['production']);
  const explicitArgToken = options['operator-token'] ? String(options['operator-token']) : undefined;
  const envToken = process.env.JANO_ADMIN_TOKEN || process.env.FIREBASE_AUTH_TOKEN;

  if (isProd) {
    if (explicitArgToken || envToken) {
      throw new Error(
        'INSECURE_OPERATOR_TOKEN_INPUT: Passing operator tokens via command-line arguments (--operator-token) ' +
        'or environment variables (JANO_ADMIN_TOKEN, FIREBASE_AUTH_TOKEN) is insecure and strictly forbidden in production. ' +
        'Use --token-stdin or interactive prompt instead.'
      );
    }

    if (options['token-stdin']) {
      const token = await readTokenFromStdin();
      if (!token) {
        throw new Error('MISSING_STDIN_TOKEN: --token-stdin was specified, but standard input was empty.');
      }
      return token;
    }

    if (process.stdin.isTTY) {
      const token = await readTokenInteractive();
      if (!token) {
        throw new Error('MISSING_INTERACTIVE_TOKEN: No token was entered at the interactive prompt.');
      }
      return token;
    }

    throw new Error('OPERATOR_TOKEN_REQUIRED_IN_PRODUCTION: In production mode, operator credentials must be provided via --token-stdin or interactive TTY prompt.');
  }

  // Non-production context (development / test runner)
  if (options['token-stdin']) {
    return await readTokenFromStdin();
  }

  if (explicitArgToken) {
    console.warn('[SECURITY WARNING] Passing operator tokens via command-line arguments (--operator-token) is exposed to process table inspection (ps aux) and shell history. Use --token-stdin instead.');
    return explicitArgToken;
  }

  if (envToken) {
    return envToken;
  }

  if (process.stdin.isTTY) {
    return await readTokenInteractive();
  }

  return undefined;
}

export async function resolveOperator(actorUid: string, token?: string): Promise<AdministrativeOperator> {
  if (!actorUid || !actorUid.trim()) {
    throw new Error('MISSING_ACTOR_UID: Every administrative CLI command requires --actor-uid=<uid> of the authorized administrator.');
  }

  // In production mode, require and cryptographically verify the operator's Firebase ID token
  if (isProductionMode()) {
    if (!token) {
      throw new Error('OPERATOR_TOKEN_REQUIRED_IN_PRODUCTION: In production mode, administrative CLI operations require an authenticated operator token via --token-stdin or interactive prompt.');
    }
    const app = getFirebaseAdminApp();
    if (!app) {
      throw new Error('FIREBASE_ADMIN_UNAVAILABLE: Firebase Admin app is not initialized.');
    }
    const { getAuth } = await import('firebase-admin/auth');
    try {
      const decoded = await getAuth(app).verifyIdToken(token, true);
      if (decoded.uid !== actorUid) {
        throw new Error(`OPERATOR_IDENTITY_MISMATCH: Provided operator token belongs to '${decoded.uid}', but --actor-uid specified '${actorUid}'. Impersonation denied.`);
      }
    } catch (err: any) {
      if (err.message?.startsWith('OPERATOR_IDENTITY_MISMATCH:')) {
        throw err;
      }
      throw new Error(`OPERATOR_TOKEN_VERIFICATION_FAILED: Failed to verify operator token: ${err.message}`);
    }
  }

  const authDir = getAuthorizationDirectory();
  const account = await authDir.getAccount(actorUid);
  if (!account) {
    throw new Error(`OPERATOR_NOT_FOUND: Operator '${actorUid}' is not registered in the authoritative directory.`);
  }

  if (account.accountStatus !== 'active') {
    throw new Error(`OPERATOR_INACTIVE: Operator account '${actorUid}' is ${account.accountStatus}.`);
  }

  const tenantMemberships = await authDir.getUserTenantMemberships(actorUid);
  const activeTenantMembership = tenantMemberships.find((m) => m.status === 'active');
  const roles = activeTenantMembership ? activeTenantMembership.roles : [];
  const caps = activeTenantMembership ? activeTenantMembership.capabilities : [];
  const tenantId = activeTenantMembership ? activeTenantMembership.tenantId : undefined;

  const facilityIds = await authDir.resolvePermittedFacilityIds(actorUid, tenantId || '');

  return {
    userId: actorUid,
    provider: 'firebase_auth',
    roles,
    tenantId,
    facilityIds,
    accountStatus: account.accountStatus,
    capabilities: caps,
  };
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));
  const service = getDirectoryProvisioningService();

  console.log(`[Jano Directory Provisioning CLI] Executing command: ${command}`);

  try {
    const operatorToken = (command !== 'help' && command !== 'bootstrap')
      ? await resolveOperatorToken(options)
      : undefined;

    switch (command) {
      case 'bootstrap': {
        const projectId = String(options['project-id'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const adminUid = String(options['admin-uid'] || '');
        const adminEmail = options['admin-email'] ? String(options['admin-email']) : undefined;
        const reason = options['reason'] ? String(options['reason']) : undefined;
        const operatorId = options['operator-id'] ? String(options['operator-id']) : (process.env.USER || 'bootstrap_operator_cli');

        const resolvedExec = resolveExecutionPrincipal();
        const executionPrincipal = options['execution-principal']
          ? String(options['execution-principal'])
          : resolvedExec.principal;
        const executionPrincipalVerified = options['execution-principal']
          ? false
          : resolvedExec.verified;
        const executionCredentialSource = resolvedExec.credentialSource;

        const result = await service.bootstrapFirstAdministrator({
          expectedProjectId: projectId,
          tenantId,
          adminUid,
          adminEmail,
          reason,
          initiatingOperator: {
            operatorId,
            executionPrincipal,
            executionPrincipalVerified,
            executionCredentialSource,
            method: 'CLI',
          },
        });

        if (!result.success) {
          console.error(`\n[BOOTSTRAP ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[BOOTSTRAP SUCCESS] First administrator provisioned:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'provision-tenant': {
        const tenantId = String(options['tenant-id'] || '');
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.provisionTenant(operator, { tenantId, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Tenant provisioned:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'provision-facility': {
        const facilityId = String(options['facility-id'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.provisionFacility(operator, { facilityId, tenantId, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Facility provisioned:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'provision-user': {
        const uid = String(options['uid'] || '');
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.provisionUser(operator, { uid, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] User account provisioned:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'create-tenant-membership': {
        const uid = String(options['uid'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const roles = options['roles'] ? String(options['roles']).split(',').map((r) => r.trim()) : [];
        const capabilities = options['capabilities'] ? String(options['capabilities']).split(',').map((c) => c.trim()) : [];
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.createTenantMembership(operator, { uid, tenantId, roles, capabilities, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Tenant membership created:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'create-facility-membership': {
        const uid = String(options['uid'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const facilityId = String(options['facility-id'] || '');
        const capabilities = options['capabilities'] ? String(options['capabilities']).split(',').map((c) => c.trim()) : ['sync:facility'];
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.createFacilityMembership(operator, { uid, tenantId, facilityId, capabilities, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Facility membership created:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'update-membership': {
        const type = String(options['type'] || 'tenant') as 'tenant' | 'facility';
        const uid = String(options['uid'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const facilityId = options['facility-id'] ? String(options['facility-id']) : undefined;
        const roles = options['roles'] ? String(options['roles']).split(',').map((r) => r.trim()) : undefined;
        const capabilities = options['capabilities'] ? String(options['capabilities']).split(',').map((c) => c.trim()) : undefined;
        const actorUid = String(options['actor-uid'] || '');
        const reason = options['reason'] ? String(options['reason']) : undefined;

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.updateMembership(operator, {
          type,
          uid,
          tenantId,
          facilityId,
          roles,
          capabilities,
          reason,
        });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Membership updated:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'set-user-status': {
        const uid = String(options['uid'] || '');
        const newStatus = String(options['status'] || '') as 'active' | 'suspended' | 'revoked';
        const reason = String(options['reason'] || '');
        const actorUid = String(options['actor-uid'] || '');

        const operator = await resolveOperator(actorUid, operatorToken);
        const result = await service.setUserAccountStatus(operator, { uid, newStatus, reason });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] User account status updated:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'set-membership-status': {
        const type = String(options['type'] || 'tenant') as 'tenant' | 'facility';
        const uid = String(options['uid'] || '');
        const tenantId = String(options['tenant-id'] || '');
        const facilityId = options['facility-id'] ? String(options['facility-id']) : undefined;
        const newStatus = String(options['status'] || '') as 'active' | 'suspended' | 'revoked';
        const reason = String(options['reason'] || '');
        const actorUid = String(options['actor-uid'] || '');

        const operator = await resolveOperator(actorUid, operatorToken);

        let result: any;
        if (type === 'facility') {
          if (!facilityId) {
            console.error('\n[ERROR] --facility-id is required when updating facility membership status.');
            process.exit(1);
          }
          result = await service.setFacilityMembershipStatus(operator, {
            uid,
            tenantId,
            facilityId,
            newStatus,
            reason,
          });
        } else {
          result = await service.setTenantMembershipStatus(operator, {
            uid,
            tenantId,
            newStatus,
            reason,
          });
        }

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[SUCCESS] Membership status updated:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'inspect': {
        const tenantId = options['tenant-id'] ? String(options['tenant-id']) : undefined;
        const facilityId = options['facility-id'] ? String(options['facility-id']) : undefined;
        const uid = options['uid'] ? String(options['uid']) : undefined;
        const includeAuditLogs = Boolean(options['audit-logs']);
        const actorUid = String(options['actor-uid'] || '');

        if (!actorUid) {
          throw new Error('MISSING_ACTOR_UID: Inspect command requires --actor-uid=<uid> of the inspecting operator.');
        }

        const operator = await resolveOperator(actorUid, operatorToken);

        const result = await service.inspectDirectory(operator, {
          tenantId,
          facilityId,
          uid,
          includeAuditLogs,
        });

        if (!result.success) {
          console.error(`\n[ERROR] ${result.error}: ${result.message}`);
          process.exit(1);
        }

        console.log('\n[INSPECTION RESULT]:');
        console.log(JSON.stringify(result.data, null, 2));
        break;
      }

      case 'help':
      default:
        printUsage();
        break;
    }
  } catch (err: any) {
    console.error(`\n[FATAL ERROR] ${err.message}`);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('provisionDirectory.ts')) {
  main();
}
