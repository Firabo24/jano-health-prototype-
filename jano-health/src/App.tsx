/**
 * Jano Health - Main Application Root
 * Offline-first, AI-powered Electronic Health Record (EHR) & Clinical Decision-Support.
 */

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './services/security/authContext';
import { Header } from './components/layout/Header';
import { Sidebar, ActiveNavTab } from './components/layout/Sidebar';
import { DashboardView } from './views/DashboardView';
import { PatientsView } from './views/PatientsView';
import { EncountersView } from './views/EncountersView';
import { AppointmentsView } from './views/AppointmentsView';
import { ClinicalView } from './views/ClinicalView';
import { LaboratoryView } from './views/LaboratoryView';
import { RadiologyView } from './views/RadiologyView';
import { PharmacyView } from './views/PharmacyView';
import { EmergencyView } from './views/EmergencyView';
import { ReferralsView } from './views/ReferralsView';
import { AIAssistantView } from './views/AIAssistantView';
import { SynchronizationView } from './views/SynchronizationView';
import { AuditLogView } from './views/AuditLogView';
import { ReportsView } from './views/ReportsView';
import { AdministrationView } from './views/AdministrationView';
import { SettingsView } from './views/SettingsView';
import { PatientChartModal } from './components/patients/PatientChartModal';
import { RegisterPatientModal } from './components/patients/RegisterPatientModal';
import { LoginPage } from './components/auth/LoginPage';
import { localDb } from './services/storage/localDatabase';
import { syncEngine, SyncStats } from './services/sync/syncEngine';

const JanoHealthApp: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveNavTab>('dashboard');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncStats, setSyncStats] = useState<SyncStats>(syncEngine.getStats());

  useEffect(() => {
    return syncEngine.subscribe((stats) => {
      setSyncStats(stats);
    });
  }, []);

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const emergencyCount = localDb.getEmergencyCases().filter((e) => e.isActive).length;

  const handleOpenPatientChart = (patientId: string) => {
    setSelectedPatientId(patientId);
  };

  const handleGlobalSearch = (query: string) => {
    setSearchQuery(query);
    setActiveTab('patients');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-teal-500 selection:text-white">
      {/* Top Header Bar */}
      <Header
        onSearchPatient={handleGlobalSearch}
        onOpenPatient={handleOpenPatientChart}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          emergencyCount={emergencyCount}
          pendingSyncCount={syncStats.queuedCount}
        />

        {/* Dynamic View Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-950">
          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={setActiveTab}
              onSelectPatient={handleOpenPatientChart}
            />
          )}

          {activeTab === 'patients' && (
            <PatientsView
              onSelectPatient={handleOpenPatientChart}
              externalSearchQuery={searchQuery}
            />
          )}

          {activeTab === 'encounters' && (
            <EncountersView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'appointments' && (
            <AppointmentsView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'clinical' && (
            <ClinicalView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'laboratory' && (
            <LaboratoryView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'radiology' && (
            <RadiologyView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'pharmacy' && (
            <PharmacyView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'emergency' && (
            <EmergencyView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'referrals' && (
            <ReferralsView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'ai_assistant' && (
            <AIAssistantView onSelectPatient={handleOpenPatientChart} />
          )}

          {activeTab === 'synchronization' && <SynchronizationView />}

          {activeTab === 'reports' && <ReportsView />}

          {activeTab === 'administration' && <AdministrationView />}

          {activeTab === 'audit_log' && <AuditLogView />}

          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Patient Chart Modal Workspace */}
      <PatientChartModal
        patientId={selectedPatientId}
        isOpen={!!selectedPatientId}
        onClose={() => setSelectedPatientId(null)}
        onSelectPatient={(newPatId) => setSelectedPatientId(newPatId)}
      />

      {/* Patient Registration Modal */}
      <RegisterPatientModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onPatientRegistered={(patient) => {
          setSelectedPatientId(patient.id);
        }}
        onOpenExistingPatient={(existingId) => {
          setIsRegisterOpen(false);
          setSelectedPatientId(existingId);
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <JanoHealthApp />
    </AuthProvider>
  );
}
