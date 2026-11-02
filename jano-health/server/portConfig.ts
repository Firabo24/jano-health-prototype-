/**
 * Jano Health - Server Port Configuration & TCP Validation
 * 
 * Enforces the Cloud Run / container platform port contract:
 * - Uses process.env.PORT when supplied by the deployment environment.
 * - Validates that the port is a valid TCP port number (integer between 1 and 65535).
 * - Fails startup with a clear configuration error if PORT is invalid (never silently falls back).
 * - Defaults to 3000 for local development when no PORT is supplied.
 */

export interface PortResolutionResult {
  port: number;
  source: 'environment' | 'default';
}

export function resolveServerPort(envPort: string | undefined = process.env.PORT): PortResolutionResult {
  if (envPort === undefined || envPort === null || envPort.trim() === '') {
    return { port: 3000, source: 'default' };
  }

  const trimmed = envPort.trim();
  const parsed = Number(trimmed);

  if (!/^\d+$/.test(trimmed) || !Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `INVALID_PORT_CONFIGURATION: The supplied PORT environment variable '${envPort}' is not a valid TCP port number. Must be an integer between 1 and 65535.`
    );
  }

  return { port: parsed, source: 'environment' };
}
