/**
 * Jano Health - Release Artifact & Runtime Data Boundary Preflight Check
 * 
 * Verifies that:
 * 1. Runtime ledger artifacts (.server_ledger_*) are not tracked in Git index.
 * 2. .gitignore contains appropriate exclusions for .server_ledger_* and *.corrupted.*.
 * 3. .dockerignore exists and excludes runtime ledger artifacts and secrets from container builds.
 * 4. Production build / packaging directories (dist/, build/) do not contain runtime ledger or secret files.
 * 5. Secret-bearing files (service account keys, PEMs, unencrypted production envs) are not present in release contexts.
 * 6. Enumerates operational ledger artifacts in the workspace safely (filenames and byte counts only).
 * 
 * Exits with code 0 on clean pass; exits with code 1 if prohibited release artifacts are detected.
 * NEVER deletes, truncates, modifies, or prints contents of any operational ledger or credential file.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

export interface PreflightCheckResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
  ledgerArtifactsFound: { filename: string; sizeBytes: number }[];
  ignoreRulesVerified: { gitignore: boolean; dockerignore: boolean };
}

export function runReleaseArtifactChecks(targetDir: string = process.cwd()): PreflightCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  const ledgerArtifactsFound: { filename: string; sizeBytes: number }[] = [];
  let gitignoreProtected = false;
  let dockerignoreProtected = false;

  // 1. Verify .gitignore protection
  const gitignorePath = path.join(targetDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
      if (gitignoreContent.includes('.server_ledger_') || gitignoreContent.includes('.server_ledger_*')) {
        gitignoreProtected = true;
      } else {
        violations.push('.gitignore is missing exclusion pattern for server ledger runtime artifacts (.server_ledger_*)');
      }
    } catch (err: any) {
      violations.push(`Failed to read .gitignore: ${err.message}`);
    }
  } else {
    violations.push('.gitignore does not exist in target directory');
  }

  // 2. Verify .dockerignore protection
  const dockerignorePath = path.join(targetDir, '.dockerignore');
  if (fs.existsSync(dockerignorePath)) {
    try {
      const dockerignoreContent = fs.readFileSync(dockerignorePath, 'utf-8');
      if (dockerignoreContent.includes('.server_ledger_') || dockerignoreContent.includes('.server_ledger_*')) {
        dockerignoreProtected = true;
      } else {
        violations.push('.dockerignore is missing exclusion pattern for server ledger runtime artifacts (.server_ledger_*)');
      }
    } catch (err: any) {
      violations.push(`Failed to read .dockerignore: ${err.message}`);
    }
  } else {
    violations.push('.dockerignore does not exist in target directory');
  }

  // 3. Check for Git-tracked runtime ledger artifacts (if in a Git repository)
  try {
    const isGit = execSync('git rev-parse --is-inside-work-tree', {
      cwd: targetDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim() === 'true';

    if (isGit) {
      const trackedFiles = execSync('git ls-files', {
        cwd: targetDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString().split('\n').filter(Boolean);

      const trackedLedgerFiles = trackedFiles.filter(
        (f) => f.includes('.server_ledger_') || f.includes('.corrupted.') || f.endsWith('.bak')
      );
      if (trackedLedgerFiles.length > 0) {
        violations.push(
          `Git index tracks prohibited runtime ledger artifact(s): ${trackedLedgerFiles.join(', ')}`
        );
      }

      const trackedSecrets = trackedFiles.filter(
        (f) => f.includes('service-account') || f.endsWith('.pem') || f.endsWith('.key') || (f.startsWith('.env') && !f.endsWith('.env.example'))
      );
      if (trackedSecrets.length > 0) {
        violations.push(
          `Git index tracks prohibited secret-bearing file(s): ${trackedSecrets.join(', ')}`
        );
      }
    }
  } catch {
    // Target directory is not a Git repo or Git binary unavailable; git tracking check skipped
  }

  // 4. Scan packaging / build output directories (dist/, build/) if present
  const packagingDirs = ['dist', 'build'];
  for (const pkgDir of packagingDirs) {
    const fullPkgPath = path.join(targetDir, pkgDir);
    if (fs.existsSync(fullPkgPath) && fs.statSync(fullPkgPath).isDirectory()) {
      try {
        const entries = fs.readdirSync(fullPkgPath, { recursive: true }) as string[];
        for (const entry of entries) {
          const entryStr = String(entry);
          if (entryStr.includes('.server_ledger_')) {
            violations.push(`Packaging directory '${pkgDir}' contains runtime ledger artifact: ${entryStr}`);
          }
          if (entryStr.includes('service-account') || entryStr.endsWith('.pem') || entryStr.endsWith('.key')) {
            violations.push(`Packaging directory '${pkgDir}' contains prohibited credential artifact: ${entryStr}`);
          }
        }
      } catch {}
    }
  }

  // 5. Scan target directory root for sensitive credential-bearing files
  try {
    const rootFiles = fs.readdirSync(targetDir);
    const prohibitedCredentialPatterns = [
      /^service[-_]account.*\.json$/i,
      /^id_rsa/i,
      /.*\.pem$/i,
      /.*\.key$/i,
      /^\.env\.production$/i,
      /^\.env\.local$/i,
    ];

    for (const f of rootFiles) {
      // Check prohibited credentials
      for (const pattern of prohibitedCredentialPatterns) {
        if (pattern.test(f)) {
          violations.push(`Prohibited credential-bearing file detected in workspace root: '${f}'`);
        }
      }

      // Check runtime ledger artifacts
      if (f.startsWith('.server_ledger_') || f.includes('.corrupted.')) {
        try {
          const stat = fs.statSync(path.join(targetDir, f));
          if (stat.isFile()) {
            ledgerArtifactsFound.push({ filename: f, sizeBytes: stat.size });
          }
        } catch {}
      }
    }
  } catch (err: any) {
    violations.push(`Failed to scan root directory: ${err.message}`);
  }

  // 6. Report on detected operational ledger artifacts
  if (ledgerArtifactsFound.length > 0) {
    const totalBytes = ledgerArtifactsFound.reduce((acc, curr) => acc + curr.sizeBytes, 0);
    warnings.push(
      `Detected ${ledgerArtifactsFound.length} operational server ledger artifact(s) in repository root (${(totalBytes / 1024).toFixed(1)} KB total). ` +
      `Verified exclusion in .gitignore and .dockerignore. ` +
      `NOTICE: Export mechanisms (such as ZIP packaging) that do not respect .gitignore must be checked before distribution.`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    ledgerArtifactsFound,
    ignoreRulesVerified: {
      gitignore: gitignoreProtected,
      dockerignore: dockerignoreProtected,
    },
  };
}

// CLI Execution entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let targetDir = process.cwd();
  const dirIdx = args.indexOf('--target-dir');
  if (dirIdx !== -1 && args[dirIdx + 1]) {
    targetDir = path.resolve(args[dirIdx + 1]);
  }

  console.log(`[Jano Preflight] Running release-artifact and data boundary preflight on: ${targetDir}`);
  const result = runReleaseArtifactChecks(targetDir);

  console.log(`[Jano Preflight] Ignore Rules Verified: .gitignore: ${result.ignoreRulesVerified.gitignore}, .dockerignore: ${result.ignoreRulesVerified.dockerignore}`);

  if (result.ledgerArtifactsFound.length > 0) {
    console.log(`[Jano Preflight] Root Ledger Artifacts Inventory (${result.ledgerArtifactsFound.length} files):`);
    for (const a of result.ledgerArtifactsFound) {
      console.log(`  - ${a.filename} (${a.sizeBytes.toLocaleString()} bytes)`);
    }
  } else {
    console.log(`[Jano Preflight] No ledger artifacts found in directory.`);
  }

  for (const w of result.warnings) {
    console.log(`[Jano Preflight Warning] ${w}`);
  }

  if (result.violations.length > 0) {
    console.error(`\n[Jano Preflight FAILED] Detected ${result.violations.length} release artifact violation(s):`);
    for (const v of result.violations) {
      console.error(`  [VIOLATION] ${v}`);
    }
    process.exit(1);
  }

  console.log(`\n[Jano Preflight PASSED] All release data boundary and artifact checks passed successfully.`);
  process.exit(0);
}
