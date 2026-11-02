/**
 * Jano Health - Clinical Patient Registration Modal
 * 
 * Implements the comprehensive 5-stage patient registration workflow:
 * 1. Master Identity & Demographics with real-time derived age
 * 2. Locality & Contact Information
 * 3. Emergency Contact & Support Network
 * 4. Baseline Clinical Summaries (Blood group, pregnancy, allergies, triage)
 * 5. Deterministic Duplicate Detection & Review with human-in-the-loop decisions
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  FileCheck,
  MapPin,
  Phone,
  Shield,
  ShieldAlert,
  User,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import { DateOfBirthPrecision, Patient, Sex } from '../../domain/types';
import { calculateAge, validateDateOfBirth } from '../../domain/clinicalUtils';
import { evaluateDuplicates, DuplicateCandidate } from '../../services/clinical/duplicateDetection';
import { patientService } from '../../services/clinical/patientService';
import { localDb } from '../../services/storage/localDatabase';
import { useAuth } from '../../services/security/authContext';

interface RegisterPatientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPatientRegistered: (patient: Patient) => void;
  onOpenExistingPatient?: (patientId: string) => void;
}

type RegistrationStep = 'identity' | 'contact' | 'clinical' | 'review';

export const RegisterPatientModal: React.FC<RegisterPatientModalProps> = ({
  isOpen,
  onClose,
  onPatientRegistered,
  onOpenExistingPatient,
}) => {
  const { currentUser, currentFacility } = useAuth();
  const [currentStep, setCurrentStep] = useState<RegistrationStep>('identity');

  // Form State
  const [formData, setFormData] = useState({
    givenName: '',
    middleName: '',
    familyName: '',
    preferredName: '',
    dateOfBirth: '1995-01-01',
    dateOfBirthPrecision: 'EXACT' as DateOfBirthPrecision,
    sex: 'female' as Sex,
    genderIdentity: '',
    maritalStatus: 'single' as 'single' | 'married' | 'divorced' | 'widowed' | 'other',
    nationalId: '',
    facilityPatientNumber: '',
    phone: '',
    alternatePhone: '',
    email: '',
    address: '',
    villageTown: '',
    city: '',
    district: currentFacility?.district || 'Central District',
    region: currentFacility?.region || 'Western Province',
    country: 'Tanzania',
    preferredLanguage: 'Swahili',
    occupation: '',
    emergencyContactName: '',
    emergencyContactRelationship: 'Spouse',
    emergencyContactPhone: '',
    bloodGroup: 'O+' as Patient['bloodGroup'],
    pregnancyStatus: 'not_pregnant' as Patient['pregnancyStatus'],
    knownAllergies: 'No known drug allergies (NKDA)',
    initialDiagnosis: '',
    triageUrgency: 'routine' as Patient['triageUrgency'],
  });

  const [overrideDuplicateReason, setOverrideDuplicateReason] = useState<string>('');
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Real-time calculated age display
  const derivedAge = useMemo(() => {
    return calculateAge(formData.dateOfBirth, formData.dateOfBirthPrecision);
  }, [formData.dateOfBirth, formData.dateOfBirthPrecision]);

  // Real-time duplicate evaluation
  const duplicateCandidates = useMemo(() => {
    if (!formData.givenName.trim() && !formData.familyName.trim() && !formData.phone && !formData.nationalId) {
      return [];
    }
    const allPatients = localDb.getPatients();
    return evaluateDuplicates(
      {
        firstName: formData.givenName.trim(),
        lastName: formData.familyName.trim(),
        givenName: formData.givenName.trim(),
        familyName: formData.familyName.trim(),
        middleName: formData.middleName.trim(),
        dateOfBirth: formData.dateOfBirth,
        dateOfBirthPrecision: formData.dateOfBirthPrecision,
        gender: formData.sex,
        sex: formData.sex,
        nationalId: formData.nationalId.trim(),
        phone: formData.phone.trim(),
        villageTown: formData.villageTown.trim(),
        district: formData.district.trim(),
        primaryFacilityId: currentFacility?.id,
      },
      allPatients,
      40 // 40% threshold for alert
    );
  }, [
    formData.givenName,
    formData.familyName,
    formData.middleName,
    formData.dateOfBirth,
    formData.dateOfBirthPrecision,
    formData.sex,
    formData.nationalId,
    formData.phone,
    formData.villageTown,
    formData.district,
    currentFacility?.id,
  ]);

  const hasHighConfidenceDuplicate = duplicateCandidates.some((c) => c.confidence === 'HIGH');

  // Reset form when opened
  useEffect(() => {
    if (isOpen) {
      setCurrentStep('identity');
      setError(null);
      setAllowDuplicateOverride(false);
      setOverrideDuplicateReason('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Validation per step
  const validateCurrentStep = (): boolean => {
    setError(null);

    if (currentStep === 'identity') {
      if (!formData.givenName.trim() || !formData.familyName.trim()) {
        setError('Given Name and Family Name are mandatory for clinical identity.');
        return false;
      }
      const dobVal = validateDateOfBirth(formData.dateOfBirth, formData.dateOfBirthPrecision);
      if (!dobVal.valid) {
        setError(dobVal.error || 'Invalid date of birth entered.');
        return false;
      }
    }

    if (currentStep === 'contact') {
      if (!formData.villageTown.trim()) {
        setError('Village / Locality is required to locate the patient for community care.');
        return false;
      }
    }

    return true;
  };

  const handleNextStep = () => {
    if (!validateCurrentStep()) return;
    if (currentStep === 'identity') setCurrentStep('contact');
    else if (currentStep === 'contact') setCurrentStep('clinical');
    else if (currentStep === 'clinical') setCurrentStep('review');
  };

  const handlePrevStep = () => {
    setError(null);
    if (currentStep === 'contact') setCurrentStep('identity');
    else if (currentStep === 'clinical') setCurrentStep('contact');
    else if (currentStep === 'review') setCurrentStep('clinical');
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCurrentStep()) return;

    if (hasHighConfidenceDuplicate && !allowDuplicateOverride) {
      setError('A potential duplicate record with high match confidence was detected. Review candidates below and confirm override reason if this is a distinct individual.');
      return;
    }

    if (allowDuplicateOverride && !overrideDuplicateReason.trim()) {
      setError('A clinical justification is required when registering a patient with strong duplicate matches.');
      return;
    }

    setIsSubmitting(true);
    try {
      const principal = {
        id: currentUser.id,
        fullName: currentUser.fullName,
        role: currentUser.role,
        facilityId: currentFacility.id,
      };

      const result = await patientService.registerPatient(
        principal,
        {
          givenName: formData.givenName.trim(),
          middleName: formData.middleName.trim() || undefined,
          familyName: formData.familyName.trim(),
          preferredName: formData.preferredName.trim() || undefined,
          dateOfBirth: formData.dateOfBirth,
          dateOfBirthPrecision: formData.dateOfBirthPrecision,
          sex: formData.sex,
          genderIdentity: formData.genderIdentity.trim() || undefined,
          maritalStatus: formData.maritalStatus,
          nationalId: formData.nationalId.trim() || undefined,
          facilityPatientNumber: formData.facilityPatientNumber.trim() || undefined,
          phone: formData.phone.trim() || undefined,
          alternatePhone: formData.alternatePhone.trim() || undefined,
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          villageTown: formData.villageTown.trim(),
          city: formData.city.trim() || undefined,
          district: formData.district.trim(),
          region: formData.region.trim() || currentFacility.region,
          country: formData.country.trim() || 'Tanzania',
          registrationFacilityId: currentFacility.id,
          primaryFacilityId: currentFacility.id,
          preferredLanguage: formData.preferredLanguage,
          occupation: formData.occupation.trim() || undefined,
          emergencyContact: formData.emergencyContactName.trim()
            ? {
                fullName: formData.emergencyContactName.trim(),
                relationship: formData.emergencyContactRelationship || 'Family',
                phone: formData.emergencyContactPhone.trim() || '',
              }
            : undefined,
          bloodGroup: formData.bloodGroup,
          pregnancyStatus: formData.sex === 'female' ? formData.pregnancyStatus : 'not_pregnant',
          allergiesSummary: formData.knownAllergies.trim()
            ? formData.knownAllergies.split(',').map((s) => s.trim())
            : ['No known drug allergies (NKDA)'],
          activeDiagnosesSummary: formData.initialDiagnosis.trim()
            ? [formData.initialDiagnosis.trim()]
            : [],
          triageUrgency: formData.triageUrgency,
        },
        {
          allowDuplicateOverride,
          duplicateOverrideReason: overrideDuplicateReason.trim(),
        }
      );

      if (!result.success || !result.patient) {
        setError(result.error || 'Failed to complete patient registration.');
        setIsSubmitting(false);
        return;
      }

      onPatientRegistered(result.patient);
      onClose();
    } catch (err: any) {
      setError(err.message || 'System error while registering patient.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-200">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-md bg-teal-500/10 border border-teal-500/30 text-teal-400">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Clinical Patient Registration</h2>
              <p className="text-xs text-slate-400">
                Facility: <span className="text-slate-300 font-semibold">{currentFacility.name}</span> • Registrar: <span className="text-slate-300">{currentUser.fullName}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wizard Steps Navigation Bar */}
        <div className="bg-slate-950/60 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs font-mono shrink-0">
          {[
            { key: 'identity', label: '1. Identity & Age' },
            { key: 'contact', label: '2. Locality & Contact' },
            { key: 'clinical', label: '3. Clinical Baseline' },
            { key: 'review', label: '4. Duplicate Check & Review' },
          ].map((s, idx) => {
            const isActive = currentStep === s.key;
            return (
              <button
                key={s.key}
                onClick={() => {
                  if (validateCurrentStep()) setCurrentStep(s.key as RegistrationStep);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors ${
                  isActive
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-4 mt-3 p-3 rounded bg-red-950/70 border border-red-800 text-red-300 text-xs flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Body (Scrollable) */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
          {/* STEP 1: IDENTITY */}
          {currentStep === 'identity' && (
            <div className="space-y-4">
              <div className="bg-slate-950/50 p-3 rounded border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-mono text-slate-400 uppercase">Derived Clinical Age</span>
                  <div className="text-lg font-bold text-teal-400 font-mono mt-0.5">{derivedAge}</div>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <span>Precision: </span>
                  <span className="font-mono text-slate-300 font-bold">{formData.dateOfBirthPrecision}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Given / First Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Baraka"
                    value={formData.givenName}
                    onChange={(e) => setFormData({ ...formData, givenName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Middle / Father's Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Selemani"
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Family / Last Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Mkwawa"
                    value={formData.familyName}
                    onChange={(e) => setFormData({ ...formData, familyName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Preferred / Calling Name</label>
                  <input
                    type="text"
                    placeholder="Optional"
                    value={formData.preferredName}
                    onChange={(e) => setFormData({ ...formData, preferredName: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Biological Sex *</label>
                  <select
                    value={formData.sex}
                    onChange={(e) => setFormData({ ...formData, sex: e.target.value as Sex })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Marital Status</label>
                  <select
                    value={formData.maritalStatus}
                    onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-300 font-medium mb-1">
                    Date of Birth {formData.dateOfBirthPrecision === 'YEAR_ONLY' ? '(YYYY)' : formData.dateOfBirthPrecision === 'MONTH_YEAR' ? '(YYYY-MM)' : '(YYYY-MM-DD)'} *
                  </label>
                  <input
                    type={formData.dateOfBirthPrecision === 'EXACT' ? 'date' : 'text'}
                    value={formData.dateOfBirth}
                    onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                    placeholder={formData.dateOfBirthPrecision === 'YEAR_ONLY' ? 'e.g. 1968' : '1995-01-01'}
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">DOB Precision Level</label>
                  <select
                    value={formData.dateOfBirthPrecision}
                    onChange={(e) => setFormData({ ...formData, dateOfBirthPrecision: e.target.value as DateOfBirthPrecision })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="EXACT">EXACT (Full Calendar Date)</option>
                    <option value="MONTH_YEAR">MONTH_YEAR (Month & Year)</option>
                    <option value="YEAR_ONLY">YEAR_ONLY (Approximate Year)</option>
                    <option value="UNKNOWN">UNKNOWN (Age Estimated)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">National Identifier (NIDA / Gov ID)</label>
                  <input
                    type="text"
                    placeholder="e.g. NIDA-19920518-7711"
                    value={formData.nationalId}
                    onChange={(e) => setFormData({ ...formData, nationalId: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Paper Registry / Booklet #</label>
                  <input
                    type="text"
                    placeholder="e.g. REG-2026-881"
                    value={formData.facilityPatientNumber}
                    onChange={(e) => setFormData({ ...formData, facilityPatientNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: CONTACT & RESIDENCE */}
          {currentStep === 'contact' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Primary Phone Number</label>
                  <input
                    type="tel"
                    placeholder="e.g. +255 754 112 390"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Alternate / Household Phone</label>
                  <input
                    type="tel"
                    placeholder="e.g. +255 762 001 928"
                    value={formData.alternatePhone}
                    onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Village / Ward / Neighborhood *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kasulu Village"
                    value={formData.villageTown}
                    onChange={(e) => setFormData({ ...formData, villageTown: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">District / Sub-County</label>
                  <input
                    type="text"
                    value={formData.district}
                    onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Region / Province</label>
                  <input
                    type="text"
                    value={formData.region}
                    onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Physical Address / Landmarks</label>
                <input
                  type="text"
                  placeholder="e.g. Near Kasulu Central Market, blue gate"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Preferred Spoken Language</label>
                  <input
                    type="text"
                    placeholder="e.g. Swahili, Amharic, Oromo, English"
                    value={formData.preferredLanguage}
                    onChange={(e) => setFormData({ ...formData, preferredLanguage: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Occupation</label>
                  <input
                    type="text"
                    placeholder="e.g. Farmer, Merchant, Teacher"
                    value={formData.occupation}
                    onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CLINICAL BASELINE & EMERGENCY CONTACT */}
          {currentStep === 'clinical' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-950/50 rounded border border-slate-800">
                <h4 className="font-semibold text-slate-300 text-xs mb-2">Emergency Contact</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Contact Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Zainab Mkwawa"
                      value={formData.emergencyContactName}
                      onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Relationship</label>
                    <input
                      type="text"
                      placeholder="e.g. Spouse, Mother, Brother"
                      value={formData.emergencyContactRelationship}
                      onChange={(e) => setFormData({ ...formData, emergencyContactRelationship: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="e.g. +255 754 990 123"
                      value={formData.emergencyContactPhone}
                      onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Blood Group (if verified)</label>
                  <select
                    value={formData.bloodGroup}
                    onChange={(e) => setFormData({ ...formData, bloodGroup: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="O+">O Rh-Positive (O+)</option>
                    <option value="O-">O Rh-Negative (O-)</option>
                    <option value="A+">A Rh-Positive (A+)</option>
                    <option value="A-">A Rh-Negative (A-)</option>
                    <option value="B+">B Rh-Positive (B+)</option>
                    <option value="B-">B Rh-Negative (B-)</option>
                    <option value="AB+">AB Rh-Positive (AB+)</option>
                    <option value="AB-">AB Rh-Negative (AB-)</option>
                  </select>
                </div>

                {formData.sex === 'female' ? (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Pregnancy Status</label>
                    <select
                      value={formData.pregnancyStatus}
                      onChange={(e) => setFormData({ ...formData, pregnancyStatus: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                    >
                      <option value="not_pregnant">Not Pregnant</option>
                      <option value="pregnant">Pregnant (ANC Active)</option>
                      <option value="postpartum">Postpartum (&lt; 6 weeks)</option>
                      <option value="unknown">Unknown</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-slate-400 mb-1">Pregnancy Status</label>
                    <input
                      disabled
                      value="N/A (Male Patient)"
                      className="w-full bg-slate-950/60 border border-slate-800 rounded px-3 py-2 text-slate-500"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Triage Acuity Level</label>
                  <select
                    value={formData.triageUrgency}
                    onChange={(e) => setFormData({ ...formData, triageUrgency: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                  >
                    <option value="routine">Routine (Stable Ambulatory)</option>
                    <option value="urgent">Urgent (Priority Outpatient)</option>
                    <option value="emergency">Emergency (Immediate Resuscitation)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Known Drug Allergies (Comma-separated)</label>
                <input
                  type="text"
                  placeholder="e.g. Penicillin, Cotrimoxazole, Aspirin (or NKDA)"
                  value={formData.knownAllergies}
                  onChange={(e) => setFormData({ ...formData, knownAllergies: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Presenting Problem / Primary Working Diagnosis</label>
                <input
                  type="text"
                  placeholder="e.g. Acute febrile illness, suspected malaria"
                  value={formData.initialDiagnosis}
                  onChange={(e) => setFormData({ ...formData, initialDiagnosis: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>
          )}

          {/* STEP 4: DUPLICATE CHECK & PRE-REGISTRATION REVIEW */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              {/* Duplicate Candidate Warning or Clean Pass */}
              {duplicateCandidates.length > 0 ? (
                <div className="p-4 rounded-lg bg-amber-950/40 border border-amber-800/80 space-y-3">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                    <span>Duplicate Check: {duplicateCandidates.length} Matching Record(s) Found</span>
                  </div>
                  <p className="text-xs text-amber-200/80">
                    To prevent fragmented clinical history and duplicate records in the healthcare mesh, please verify if this patient already has a registered chart.
                  </p>

                  <div className="space-y-2 mt-2">
                    {duplicateCandidates.map((cand) => (
                      <div
                        key={cand.patient.id}
                        className="bg-slate-900 p-3 rounded border border-amber-900/60 flex flex-wrap items-center justify-between gap-2"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">
                              {cand.patient.firstName} {cand.patient.lastName}
                            </span>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-teal-300">
                              MRN: {cand.patient.mrn}
                            </span>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold uppercase ${
                                cand.confidence === 'HIGH'
                                  ? 'bg-red-900 text-red-300'
                                  : cand.confidence === 'MEDIUM'
                                  ? 'bg-amber-900 text-amber-300'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              Match: {cand.overallScore}% ({cand.confidence})
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            DOB: {cand.patient.dateOfBirth} • Phone: {cand.patient.phone || 'None'} • Locality: {cand.patient.villageTown}, {cand.patient.district}
                          </p>
                          <ul className="text-[10px] text-amber-300/80 list-disc list-inside mt-1">
                            {cand.reasons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                        </div>

                        {onOpenExistingPatient && (
                          <button
                            type="button"
                            onClick={() => {
                              onOpenExistingPatient(cand.patient.id);
                              onClose();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium text-xs transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Open Existing Chart</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Override Confirmation */}
                  <div className="pt-2 border-t border-amber-900/60 space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDuplicateOverride}
                        onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                        className="mt-0.5 rounded border-slate-700 bg-slate-950 text-teal-500 focus:ring-0"
                      />
                      <span className="text-xs text-amber-200">
                        I confirm this is a distinct, new individual despite the duplicate match signals.
                      </span>
                    </label>

                    {allowDuplicateOverride && (
                      <div>
                        <label className="block text-slate-300 font-medium mb-1">
                          Mandatory Clinical Justification for Duplicate Override *
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Verified distinct twin sibling; shared household mobile phone"
                          value={overrideDuplicateReason}
                          onChange={(e) => setOverrideDuplicateReason(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-slate-100 focus:outline-none focus:border-teal-500"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded bg-teal-950/30 border border-teal-800/60 flex items-center gap-2.5 text-teal-300 text-xs">
                  <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
                  <div>
                    <span className="font-bold">Duplicate Verification Passed:</span> No matching records identified in the local index.
                  </div>
                </div>
              )}

              {/* Comprehensive Summary Review Card */}
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider">Registration Summary</h4>
                  <span className="font-mono text-[11px] text-teal-400">MRN Auto-assigned on Save</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Full Name</span>
                    <span className="font-semibold text-slate-100">
                      {formData.givenName} {formData.middleName ? formData.middleName + ' ' : ''}{formData.familyName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Date of Birth / Age</span>
                    <span className="font-semibold text-slate-100">
                      {formData.dateOfBirth} ({derivedAge})
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Biological Sex</span>
                    <span className="font-semibold text-slate-100 uppercase">{formData.sex}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Locality</span>
                    <span className="font-semibold text-slate-100">
                      {formData.villageTown}, {formData.district}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Phone</span>
                    <span className="font-semibold text-slate-100">{formData.phone || 'None'}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Blood Group</span>
                    <span className="font-semibold text-slate-100">{formData.bloodGroup}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Triage Acuity</span>
                    <span className="font-semibold text-slate-100 uppercase">{formData.triageUrgency}</span>
                  </div>

                  <div>
                    <span className="text-slate-400 block text-[11px]">Registration Facility</span>
                    <span className="font-semibold text-slate-100">{currentFacility.name}</span>
                  </div>
                </div>

                {formData.knownAllergies && (
                  <div className="pt-2 border-t border-slate-800 text-xs">
                    <span className="text-slate-400 font-medium">Allergies: </span>
                    <span className="text-red-300 font-mono">{formData.knownAllergies}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div>
            {currentStep !== 'identity' && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="flex items-center gap-1.5 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded bg-transparent hover:bg-slate-800 text-slate-400 hover:text-white text-xs transition-colors"
            >
              Cancel
            </button>

            {currentStep !== 'review' ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-colors"
              >
                <span>Continue</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRegisterSubmit}
                disabled={isSubmitting || (hasHighConfidenceDuplicate && !allowDuplicateOverride)}
                className={`flex items-center gap-1.5 px-5 py-2 rounded text-white text-xs font-bold transition-all shadow-md ${
                  isSubmitting || (hasHighConfidenceDuplicate && !allowDuplicateOverride)
                    ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                    : 'bg-teal-600 hover:bg-teal-500'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Clock className="w-4 h-4 animate-spin" />
                    <span>Registering Patient...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-4 h-4" />
                    <span>Confirm & Register Patient</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
