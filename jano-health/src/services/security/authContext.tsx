/**
 * Jano Health - Security & Authentication Context
 * Manages authenticated user session, facility boundaries, RBAC authorization,
 * and security tokens for offline & online operation.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { DEMO_FACILITIES, DEMO_USERS } from '../../data/syntheticDemoData';
import { CANONICAL_DEMO_USERS, DEMO_FACILITY_REGISTRY, DemoUser, findDemoUser, getAllDemoUsers } from '../../config/demoUsers';
import { hasCapability, hasPermission, Capability, AuthorizationError } from '../../domain/permissions';
import { Facility, Permission, RoleType, User } from '../../domain/types';
import { auditService } from '../audit/auditService';
import { cloudRepository } from '../cloud/cloudRepository';
import { getAuthAdapter } from './authAdapter';

export type AuthMode = 'development' | 'production';

interface AuthContextType {
  currentUser: User | DemoUser;
  currentFacility: Facility;
  availableUsers: (User | DemoUser)[];
  availableFacilities: Facility[];
  authMode: AuthMode;
  authProviderName: 'local_development' | 'firebase_auth';
  isAuthenticated: boolean;
  lastAuthError: AuthorizationError | null;
  setCurrentUser: (user: User | DemoUser) => void;
  setCurrentFacility: (facility: Facility) => void;
  switchUserByRole: (role: RoleType) => void;
  switchUserById: (userId: string) => void;
  can: (capabilityOrPermission: Capability | Permission | string) => boolean;
  assertCan: (capability: Capability | string, actionDesc?: string) => void;
  clearAuthError: () => void;
  openLoginPortal: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authMode: AuthMode = (import.meta.env.VITE_AUTH_MODE as AuthMode) || 'development';
  const [lastAuthError, setLastAuthError] = useState<AuthorizationError | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    // Retain logged-out flag across page reloads if explicitly signed out
    const loggedOut = localStorage.getItem('jano_ui_session_logged_out');
    return loggedOut !== 'true';
  });

  const [currentUser, setCurrentUserState] = useState<User | DemoUser>(() => {
    // In development mode, load last selected demo user profile for session continuity
    const saved = localStorage.getItem('jano_ui_session_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const matched = findDemoUser(parsed.id) || parsed;
        return matched;
      } catch {
        // fallback
      }
    }
    return CANONICAL_DEMO_USERS[2] || DEMO_USERS[0]; // Default: Dr. Sarah Alemu (Physician)
  });

  const [currentFacility, setCurrentFacilityState] = useState<Facility>(() => {
    const saved = localStorage.getItem('jano_ui_session_facility');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return DEMO_FACILITY_REGISTRY[parsed.id] || parsed;
      } catch {
        // fallback
      }
    }
    return DEMO_FACILITIES[0]; // Uvinza Primary Health Centre
  });

  // Keep cloud repository security boundary in sync
  useEffect(() => {
    cloudRepository.setSecurityContext(currentUser.id, currentFacility.id);
  }, [currentUser, currentFacility]);

  useEffect(() => {
    localStorage.setItem('jano_ui_session_user', JSON.stringify(currentUser));
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('jano_ui_session_facility', JSON.stringify(currentFacility));
  }, [currentFacility]);

  const setCurrentUser = (user: User | DemoUser) => {
    setCurrentUserState(user);
    setIsAuthenticated(true);
    localStorage.removeItem('jano_ui_session_logged_out');

    // If the user is a DemoUser and has specific allowedFacilities, update facility if necessary
    const demoUser = user as DemoUser;
    if (demoUser.allowedFacilities && !demoUser.allowedFacilities.includes(currentFacility.id)) {
      const preferredFac = DEMO_FACILITY_REGISTRY[demoUser.facilityId] || DEMO_FACILITIES[0];
      setCurrentFacilityState(preferredFac);
    }

    auditService.record(
      {
        actorId: user.id,
        actorName: user.fullName,
        actorRole: user.role,
        facilityId: currentFacility.id,
      },
      'USER_SESSION_SWITCHED',
      'User',
      user.id,
      { role: user.role, email: user.email }
    );
  };

  const setCurrentFacility = (facility: Facility) => {
    setCurrentFacilityState(facility);
    auditService.record(
      {
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.role,
        facilityId: facility.id,
      },
      'FACILITY_SWITCHED',
      'Facility',
      facility.id,
      { facilityCode: facility.code, facilityName: facility.name }
    );
  };

  const switchUserByRole = (role: RoleType) => {
    const match = CANONICAL_DEMO_USERS.find((u) => u.role === role) || DEMO_USERS.find((u) => u.role === role);
    if (match) {
      setCurrentUser(match);
    }
  };

  const switchUserById = (userId: string) => {
    const match = findDemoUser(userId) || CANONICAL_DEMO_USERS.find((u) => u.id === userId);
    if (match) {
      setCurrentUser(match);
    }
  };

  const can = (capabilityOrPermission: Capability | Permission | string): boolean => {
    return hasCapability(currentUser.role, capabilityOrPermission);
  };

  const assertCan = (capability: Capability | string, actionDesc?: string): void => {
    if (!can(capability)) {
      const error = new AuthorizationError(capability, currentUser.role, actionDesc);
      setLastAuthError(error);
      auditService.record(
        {
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          facilityId: currentFacility.id,
        },
        'UNAUTHORIZED_ACTION_ATTEMPTED',
        'SecurityBoundary',
        capability,
        {
          requiredCapability: capability,
          action: actionDesc || capability,
          userRole: currentUser.role,
          message: error.message,
        }
      );
      throw error;
    }
  };

  const clearAuthError = () => {
    setLastAuthError(null);
  };

  const openLoginPortal = () => {
    setIsAuthenticated(false);
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.setItem('jano_ui_session_logged_out', 'true');
    auditService.record(
      {
        actorId: currentUser.id,
        actorName: currentUser.fullName,
        actorRole: currentUser.role,
        facilityId: currentFacility.id,
      },
      'USER_LOGGED_OUT',
      'User',
      currentUser.id
    );
  };

  // Compile full list of facilities including demo facilities
  const facilitiesList: Facility[] = Array.from(
    new Map(
      [...DEMO_FACILITIES, ...Object.values(DEMO_FACILITY_REGISTRY)].map((f) => [f.id, f])
    ).values()
  ).filter((f) => !f.id.endsWith('-01') || ['fac-rural-dispensary-01', 'fac-district-hospital-01', 'fac-mobile-outreach-01'].includes(f.id));

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        currentFacility,
        availableUsers: CANONICAL_DEMO_USERS,
        availableFacilities: facilitiesList.length > 0 ? facilitiesList : DEMO_FACILITIES,
        authMode,
        authProviderName: getAuthAdapter().providerName,
        isAuthenticated,
        lastAuthError,
        setCurrentUser,
        setCurrentFacility,
        switchUserByRole,
        switchUserById,
        can,
        assertCan,
        clearAuthError,
        openLoginPortal,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
