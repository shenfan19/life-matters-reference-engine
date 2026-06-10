/**
 * Shared validation utility for model YAML files.
 * Used by both Simulator (lock-and-run) and ModelBuilder (Tools tab).
 *
 * Backend endpoint: POST /api/validate
 *   Request:  { file_path: string, sim_params?: object, opt_params?: object }
 *   Response: { valid: boolean, errors: string[] }
 *
 * Future extension: pass sim_params / opt_params to also validate
 * simulator and optimizer parameter completeness/ranges.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidateOptions {
  /** When provided, backend will also check these sim parameters */
  simParams?: Record<string, unknown>;
  /** When provided, backend will also check these optimizer parameters */
  optParams?: Record<string, unknown>;
}

export async function validateModelFile(
  filePath: string,
  options: ValidateOptions = {},
): Promise<ValidationResult> {
  try {
    const body: Record<string, unknown> = { file_path: filePath };
    if (options.simParams) body.sim_params = options.simParams;
    if (options.optParams) body.opt_params = options.optParams;

    const resp = await fetch('/api/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return { valid: false, errors: [`HTTP ${resp.status}: ${txt.slice(0, 150)}`] };
    }

    const d = await resp.json();

    // Normalise across response shapes:
    //   new shape → { valid, errors }
    //   old shape → { success, data: { valid, errors } }
    const valid  = d.valid  !== undefined ? Boolean(d.valid)       : Boolean(d.data?.valid);
    const errors: string[] =
      Array.isArray(d.errors)      ? d.errors :
      Array.isArray(d.data?.errors)? d.data.errors :
      d.data?.error                ? [String(d.data.error)] :
      d.detail                     ? [String(d.detail)] :
      [];

    return { valid, errors };
  } catch (e: any) {
    return { valid: false, errors: [`Network error: ${String(e)}`] };
  }
}
