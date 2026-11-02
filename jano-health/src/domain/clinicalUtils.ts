/**
 * Jano Health - Clinical Utilities & Domain Normalization
 * 
 * Provides canonical, centralized healthcare calculations:
 * - Date of birth precision handling (EXACT, MONTH_YEAR, YEAR_ONLY, UNKNOWN)
 * - Single source of truth for age derivation (never persisted directly)
 * - String normalization for collision-resistant indexing and duplicate scoring
 * - Safe date validation rejecting future births
 */

import { DateOfBirthPrecision } from './types';

/**
 * Calculates human-readable clinical age from date of birth and precision.
 * 
 * Age is a derived clinical value and must NEVER be stored as an authoritative field.
 * Standard clinical notation:
 * - Newborn / neonate (< 30 days): "X d" (e.g., "12 d")
 * - Infant / toddler (< 24 months): "X m" (e.g., "18 m")
 * - Child & Adult (>= 2 years): "X y" (e.g., "28 y")
 * - Incomplete / Approximate (YEAR_ONLY or MONTH_YEAR): "Approx. X y"
 * - Unknown: "Unknown age"
 */
export function calculateAge(
  dateOfBirth: string,
  precision: DateOfBirthPrecision = 'EXACT',
  referenceDate: Date | string = new Date()
): string {
  if (!dateOfBirth || precision === 'UNKNOWN') {
    return 'Unknown age';
  }

  const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
  if (isNaN(ref.getTime())) {
    return 'Unknown age';
  }

  // Parse date based on precision or format
  const parts = dateOfBirth.split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length === 0 || isNaN(parts[0])) {
    return 'Unknown age';
  }

  const birthYear = parts[0];
  const birthMonth = parts.length > 1 && !isNaN(parts[1]) ? parts[1] - 1 : 0;
  const birthDay = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 1;

  if (precision === 'YEAR_ONLY' || parts.length === 1) {
    const approxYears = ref.getFullYear() - birthYear;
    return approxYears >= 0 ? `Approx. ${approxYears} y` : 'Unknown age';
  }

  const birthDate = new Date(birthYear, birthMonth, birthDay);
  if (isNaN(birthDate.getTime())) {
    return 'Unknown age';
  }

  const diffMs = ref.getTime() - birthDate.getTime();
  if (diffMs < 0) {
    return 'Future birth';
  }

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths =
    (ref.getFullYear() - birthDate.getFullYear()) * 12 +
    (ref.getMonth() - birthDate.getMonth()) -
    (ref.getDate() < birthDate.getDate() ? 1 : 0);
  let diffYears = ref.getFullYear() - birthDate.getFullYear();
  if (
    ref.getMonth() < birthDate.getMonth() ||
    (ref.getMonth() === birthDate.getMonth() && ref.getDate() < birthDate.getDate())
  ) {
    diffYears--;
  }

  if (precision === 'MONTH_YEAR') {
    return diffYears >= 2 ? `Approx. ${diffYears} y` : `Approx. ${Math.max(0, diffMonths)} m`;
  }

  // Exact precision rules:
  if (diffDays < 30) {
    return `${Math.max(0, diffDays)} d`;
  }
  if (diffMonths < 24) {
    return `${Math.max(1, diffMonths)} m`;
  }
  return `${diffYears} y`;
}

/**
 * Calculates numeric age in years for clinical dosage or triage criteria.
 */
export function calculateAgeInYears(
  dateOfBirth: string,
  referenceDate: Date | string = new Date()
): number | null {
  if (!dateOfBirth) return null;
  const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
  const parts = dateOfBirth.split(/[-/]/).map((p) => parseInt(p, 10));
  if (parts.length === 0 || isNaN(parts[0])) return null;

  const birthYear = parts[0];
  const birthMonth = parts.length > 1 && !isNaN(parts[1]) ? parts[1] - 1 : 0;
  const birthDay = parts.length > 2 && !isNaN(parts[2]) ? parts[2] : 1;
  const birthDate = new Date(birthYear, birthMonth, birthDay);

  if (isNaN(birthDate.getTime())) return null;

  let diffYears = ref.getFullYear() - birthDate.getFullYear();
  if (
    ref.getMonth() < birthDate.getMonth() ||
    (ref.getMonth() === birthDate.getMonth() && ref.getDate() < birthDate.getDate())
  ) {
    diffYears--;
  }
  return diffYears >= 0 ? diffYears : null;
}

/**
 * Validates date of birth against clinical sanity boundaries.
 * Rejects future dates and ages > 130 years.
 */
export function validateDateOfBirth(
  dateOfBirth: string,
  precision: DateOfBirthPrecision = 'EXACT',
  referenceDate: Date | string = new Date()
): { valid: boolean; error?: string } {
  if (!dateOfBirth || !dateOfBirth.trim()) {
    if (precision === 'UNKNOWN') return { valid: true };
    return { valid: false, error: 'Date of birth is required' };
  }

  const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate;
  const parts = dateOfBirth.split(/[-/]/).map((p) => parseInt(p, 10));
  const year = parts[0];

  if (isNaN(year) || year < 1890) {
    return { valid: false, error: 'Birth year must be 1890 or later' };
  }

  if (year > ref.getFullYear()) {
    return { valid: false, error: 'Date of birth cannot be in the future' };
  }

  if (precision === 'YEAR_ONLY') {
    return { valid: true };
  }

  if (precision === 'MONTH_YEAR' && parts.length >= 2) {
    const month = parts[1];
    if (month < 1 || month > 12) {
      return { valid: false, error: 'Month must be between 1 and 12' };
    }
    if (year === ref.getFullYear() && month > ref.getMonth() + 1) {
      return { valid: false, error: 'Birth month cannot be in the future' };
    }
    return { valid: true };
  }

  // Exact validation
  const parsed = new Date(dateOfBirth);
  if (isNaN(parsed.getTime())) {
    return { valid: false, error: 'Invalid calendar date' };
  }

  if (parsed.getTime() > ref.getTime()) {
    return { valid: false, error: 'Date of birth cannot be in the future' };
  }

  return { valid: true };
}

/**
 * Formats a Date of Birth display string taking precision into account.
 */
export function formatDateOfBirthDisplay(
  dateOfBirth: string,
  precision: DateOfBirthPrecision = 'EXACT'
): string {
  if (!dateOfBirth || precision === 'UNKNOWN') return 'Unknown';

  const parts = dateOfBirth.split(/[-/]/);
  if (parts.length === 0) return 'Unknown';

  const year = parts[0];
  const monthIndex = parts.length > 1 ? parseInt(parts[1], 10) - 1 : -1;
  const day = parts.length > 2 ? parseInt(parts[2], 10) : -1;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  if (precision === 'YEAR_ONLY' || parts.length === 1) {
    return `Approx. ${year}`;
  }

  if (precision === 'MONTH_YEAR' || parts.length === 2) {
    const monthName = monthIndex >= 0 && monthIndex < 12 ? months[monthIndex] : '';
    return monthName ? `${monthName} ${year}` : `${year}`;
  }

  // Exact format: "14 Apr 1992"
  const monthName = monthIndex >= 0 && monthIndex < 12 ? months[monthIndex] : '';
  return day > 0 && monthName ? `${day} ${monthName} ${year}` : dateOfBirth;
}

/**
 * Normalizes patient names for deterministic comparison and indexing.
 * Collapses whitespace, trims, lowercases, and strips special characters.
 */
export function normalizePatientName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, '')     // remove punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

/**
 * Normalizes phone numbers for duplicate scoring.
 * Removes spaces, dashes, parentheses, and normalizes national/international formats.
 */
export function normalizePhoneNumber(phone?: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9+]/g, '').trim();
  // Standardize Ethiopian local mobile prefix "09..." or "07..." to "+251..."
  if (cleaned.startsWith('09') && cleaned.length === 10) {
    return '+251' + cleaned.substring(1);
  }
  if (cleaned.startsWith('07') && cleaned.length === 10) {
    return '+251' + cleaned.substring(1);
  }
  return cleaned;
}

/**
 * Normalizes identifier strings (MRN, National ID, Passport)
 */
export function normalizeIdentifier(id?: string): string {
  if (!id) return '';
  return id.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}
