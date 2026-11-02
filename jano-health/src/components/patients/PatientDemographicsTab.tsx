/**
 * Jano Health - Patient Demographics & Master Index Tab
 * 
 * Displays comprehensive patient demographic metadata, locality, contact info,
 * and emergency contacts. Allows authorized personnel to update demographics with
 * full clinical audit trail.
 */

import React, { useState } from 'react';
import {
  AlertCircle,
  Building,
  Calendar,
  Check,
  Clock,
  Edit3,
  Globe,
  Heart,
  Lock,
  Mail,
  MapPin,
  Phone,
  Save,
  Shield,
  User,
  UserCheck,
  X,
} from 'lucide-react';
import { Patient } from '../../domain/types';
import { calculateAge } from '../../domain/clinicalUtils';
import { patientService } from '../../services/clinical/patientService';
import { useAuth } from '../../services/security/authContext';

interface PatientDemographicsTabProps {
  patient: Patient;
  onPatientUpdated: () => void;
  onDenyPermission: (capability: string, actionTitle: string, reason: string) => void;
}

export const PatientDemographicsTab: React.FC<PatientDemographicsTabProps> = ({
  patient,
  onPatientUpdated,
  onDenyPermission,
}) => {
  const { currentUser, currentFacility, can } = useAuth();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canEdit = can('patient.update') || can('patient:update');

  const [editFormData, setEditFormData] = useState({
    preferredName: patient.preferredName || '',
    phone: patient.phone || '',
    alternatePhone: patient.alternatePhone || '',
    email: patient.email || '',
    address: patient.address || '',
    villageTown: patient.villageTown || '',
    district: patient.district || '',
    region: patient.region || '',
    country: patient.country || 'Tanzania',
    preferredLanguage: patient.preferredLanguage || 'Swahili',
    occupation: patient.occupation || '',
    maritalStatus: (patient.maritalStatus || 'single') as any,
    emergencyContactName: patient.emergencyContact?.fullName || '',
    emergencyContactRelationship: patient.emergencyContact?.relationship || '',
    emergencyContactPhone: patient.emergencyContact?.phone || '',
    bloodGroup: patient.bloodGroup || 'O+',
    pregnancyStatus: patient.pregnancyStatus || 'not_pregnant',
    allergiesSummary: patient.allergiesSummary ? patient.allergiesSummary.join(', ') : '',
  });

  const handleStartEdit = () => {
    if (!canEdit) {
      onDenyPermission(
        'patient.update',
        'Edit Patient Demographics',
        'Demographic record modifications require authorized registrar, records supervisor, or facility administrator permissions.'
      );
      return;
    }
    setError(null);
    setIsEditing(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    if (!editFormData.villageTown.trim()) {
      setError('Village/Locality is mandatory for community health tracking.');
      return;
    }

    setIsSaving(true);
    try {
      const principal = {
        id: currentUser.id,
        fullName: currentUser.fullName,
        role: currentUser.role,
        facilityId: currentFacility.id,
      };

      const result = await patientService.updatePatientDemographics(principal, patient.id, {
        preferredName: editFormData.preferredName.trim() || undefined,
        phone: editFormData.phone.trim() || undefined,
        alternatePhone: editFormData.alternatePhone.trim() || undefined,
        email: editFormData.email.trim() || undefined,
        address: editFormData.address.trim() || undefined,
        villageTown: editFormData.villageTown.trim(),
        district: editFormData.district.trim(),
        region: editFormData.region.trim(),
        country: editFormData.country.trim(),
        preferredLanguage: editFormData.preferredLanguage.trim(),
        occupation: editFormData.occupation.trim() || undefined,
        maritalStatus: editFormData.maritalStatus,
        emergencyContact: editFormData.emergencyContactName.trim()
          ? {
              fullName: editFormData.emergencyContactName.trim(),
              relationship: editFormData.emergencyContactRelationship || 'Relative',
              phone: editFormData.emergencyContactPhone.trim() || '',
            }
          : undefined,
        bloodGroup: editFormData.bloodGroup as any,
        pregnancyStatus: editFormData.pregnancyStatus as any,
        allergiesSummary: editFormData.allergiesSummary.trim()
          ? editFormData.allergiesSummary.split(',').map((s) => s.trim())
          : ['No known drug allergies (NKDA)'],
      });

      if (!result.success) {
        setError(result.error || 'Failed to update patient demographics.');
        setIsSaving(false);
        return;
      }

      setIsEditing(false);
      onPatientUpdated();
    } catch (err: any) {
      setError(err.message || 'Error occurred while saving demographics.');
    } finally {
      setIsSaving(false);
    }
  };

  const calculatedAge = calculateAge(patient.dateOfBirth, patient.dateOfBirthPrecision);

  return (
    <div className="space-y-4 text-xs">
      {/* Header & Edit Action */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-bold text-white">Master Patient Demographics & Record Index</h3>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-800 text-teal-300 border border-slate-700">
              v{patient.version}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Authoritative clinical identity registered at {patient.registrationFacilityId || patient.primaryFacilityId}
          </p>
        </div>

        <div>
          {!isEditing ? (
            <button
              onClick={handleStartEdit}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                canEdit
                  ? 'bg-slate-800 hover:bg-slate-750 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {!canEdit && <Lock className="w-3.5 h-3.5 text-slate-400" />}
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Demographics</span>
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Edit</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 rounded bg-red-950/70 border border-red-800 text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* View Mode */}
      {!isEditing ? (
        <div className="space-y-4">
          {/* Section 1: Core Legal Identity */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              1. Master Identification
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-400 block text-[11px]">Given / First Name</span>
                <span className="font-bold text-white text-xs">{patient.givenName || patient.firstName}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Middle / Father's Name</span>
                <span className="font-semibold text-slate-200">{patient.middleName || '—'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Family / Last Name</span>
                <span className="font-bold text-white text-xs">{patient.familyName || patient.lastName}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Preferred Calling Name</span>
                <span className="font-semibold text-slate-200">{patient.preferredName || '—'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Master Record Number (MRN)</span>
                <span className="font-mono font-bold text-teal-400">{patient.mrn}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">National Identifier (NIDA)</span>
                <span className="font-mono text-slate-200">{patient.nationalId || patient.nationalIdentifier || 'None recorded'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Paper Registry #</span>
                <span className="font-mono text-slate-200">{patient.facilityPatientNumber || 'None'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">System Internal UUID</span>
                <span className="font-mono text-slate-400 text-[10px]">{patient.id}</span>
              </div>
            </div>
          </div>

          {/* Section 2: Clinical Age & Biological Attributes */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              2. Age, Sex & Vital Status
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-400 block text-[11px]">Derived Clinical Age</span>
                <span className="font-bold text-teal-400 font-mono text-sm">{calculatedAge}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Date of Birth</span>
                <span className="font-mono text-slate-200">{patient.dateOfBirth}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">DOB Precision</span>
                <span className="font-mono text-slate-300 font-bold">{patient.dateOfBirthPrecision || 'EXACT'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Biological Sex</span>
                <span className="font-bold text-slate-100 uppercase">{patient.sex || patient.gender}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Blood Group</span>
                <span className="font-mono font-bold text-red-300">{patient.bloodGroup || 'Unknown'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Pregnancy / ANC Status</span>
                <span className="font-semibold text-slate-200">
                  {patient.sex === 'male' || patient.gender === 'male' ? 'N/A (Male)' : patient.pregnancyStatus?.replace('_', ' ') || 'Not pregnant'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Marital Status</span>
                <span className="capitalize text-slate-200">{patient.maritalStatus || 'Single'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Lifecycle Status</span>
                <span className="font-mono text-emerald-400 font-bold">{patient.patientStatus || 'ACTIVE'}</span>
              </div>
            </div>
          </div>

          {/* Section 3: Contact & Locality */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              3. Locality, Household & Communication
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <span className="text-slate-400 block text-[11px]">Primary Phone</span>
                <span className="font-mono text-slate-200">{patient.phone || 'None'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Alternate Phone</span>
                <span className="font-mono text-slate-200">{patient.alternatePhone || 'None'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Village / Ward / Locality</span>
                <span className="font-semibold text-white">{patient.villageTown}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">District / Sub-County</span>
                <span className="font-semibold text-slate-200">{patient.district}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Region / Province</span>
                <span className="text-slate-200">{patient.region || 'Western Province'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Country</span>
                <span className="text-slate-200">{patient.country || 'Tanzania'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Preferred Language</span>
                <span className="text-slate-200">{patient.preferredLanguage || 'Swahili'}</span>
              </div>

              <div>
                <span className="text-slate-400 block text-[11px]">Occupation</span>
                <span className="text-slate-200">{patient.occupation || 'Unspecified'}</span>
              </div>
            </div>

            {patient.address && (
              <div className="pt-2 border-t border-slate-800/80">
                <span className="text-slate-400 block text-[11px]">Physical Address & Landmarks</span>
                <span className="text-slate-200">{patient.address}</span>
              </div>
            )}
          </div>

          {/* Section 4: Emergency Contact & Support */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              4. Emergency Contact & Family Liaison
            </h4>

            {patient.emergencyContact ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-400 block text-[11px]">Contact Person</span>
                  <span className="font-bold text-white">{patient.emergencyContact.fullName}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Relationship</span>
                  <span className="text-slate-200">{patient.emergencyContact.relationship}</span>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">Emergency Phone</span>
                  <span className="font-mono text-teal-300">{patient.emergencyContact.phone || 'None'}</span>
                </div>
              </div>
            ) : (
              <p className="text-slate-500 italic">No emergency contact designated.</p>
            )}
          </div>
        </div>
      ) : (
        /* Edit Form Mode */
        <form onSubmit={handleSave} className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-teal-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              Edit Demographic Details
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Preferred Calling Name</label>
                <input
                  type="text"
                  value={editFormData.preferredName}
                  onChange={(e) => setEditFormData({ ...editFormData, preferredName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Primary Phone</label>
                <input
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Alternate Phone</label>
                <input
                  type="tel"
                  value={editFormData.alternatePhone}
                  onChange={(e) => setEditFormData({ ...editFormData, alternatePhone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Village / Locality *</label>
                <input
                  type="text"
                  required
                  value={editFormData.villageTown}
                  onChange={(e) => setEditFormData({ ...editFormData, villageTown: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">District</label>
                <input
                  type="text"
                  value={editFormData.district}
                  onChange={(e) => setEditFormData({ ...editFormData, district: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Region</label>
                <input
                  type="text"
                  value={editFormData.region}
                  onChange={(e) => setEditFormData({ ...editFormData, region: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Preferred Language</label>
                <input
                  type="text"
                  value={editFormData.preferredLanguage}
                  onChange={(e) => setEditFormData({ ...editFormData, preferredLanguage: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Occupation</label>
                <input
                  type="text"
                  value={editFormData.occupation}
                  onChange={(e) => setEditFormData({ ...editFormData, occupation: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Marital Status</label>
                <select
                  value={editFormData.maritalStatus}
                  onChange={(e) => setEditFormData({ ...editFormData, maritalStatus: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Physical Address / Street / Landmarks</label>
              <input
                type="text"
                value={editFormData.address}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold text-teal-300 uppercase tracking-wider text-[11px] font-mono border-b border-slate-800 pb-2">
              Emergency Contact Information
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Contact Name</label>
                <input
                  type="text"
                  value={editFormData.emergencyContactName}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContactName: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Relationship</label>
                <input
                  type="text"
                  value={editFormData.emergencyContactRelationship}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContactRelationship: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Phone</label>
                <input
                  type="tel"
                  value={editFormData.emergencyContactPhone}
                  onChange={(e) => setEditFormData({ ...editFormData, emergencyContactPhone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-100 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow transition-colors"
            >
              {isSaving ? <Clock className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>Save Demographics</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
