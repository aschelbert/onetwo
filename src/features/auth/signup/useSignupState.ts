// State machine for the 3-step signup wizard.
// Steps: building → plan → account

import { useState, useCallback } from 'react';
import type { PlanId, BillingInterval, BuildingAmenity } from '@/lib/tiers';
import type { PlanPickerValue } from '@/features/subscription/PlanPicker';
import { recommendPlan } from '@/lib/signup';
import type { BoardRoleKey } from '@/types/auth';

export type SignupStep = 'building' | 'plan' | 'account';

export interface AddressResult {
  status: 'verified' | 'not_condo' | 'not_found';
  marAddressId?: string;
  fullAddress?: string;
  ssl?: string;
  ward?: string;
  unitsOnRecord?: number;
  lat?: number;
  lng?: number;
  message?: string;
}

export interface SignupState {
  step: SignupStep;

  // Step 1: Building
  buildingName: string;
  addressQuery: string;
  addressResult: AddressResult | null;
  addressLoading: boolean;
  totalUnits: number | '';
  amenities: BuildingAmenity[];

  // Step 2: Plan
  planPicker: PlanPickerValue;

  // Step 3: Account
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  iAmRole: 'board_member' | 'resident' | 'property_manager';
  roleKey: BoardRoleKey | null;
}

const INITIAL_STATE: SignupState = {
  step: 'building',
  buildingName: '',
  addressQuery: '',
  addressResult: null,
  addressLoading: false,
  totalUnits: '',
  amenities: [],
  planPicker: {
    plan: 'self_managed',
    interval: 'monthly',
    onCall: false,
    pmSeat: false,
    setup: false,
  },
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  iAmRole: 'board_member',
  roleKey: 'president',
};

export function useSignupState() {
  const [state, setState] = useState<SignupState>(INITIAL_STATE);

  const set = useCallback(<K extends keyof SignupState>(key: K, value: SignupState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const setStep = useCallback((step: SignupStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const setAmenities = useCallback((amenities: BuildingAmenity[]) => {
    setState(prev => ({
      ...prev,
      amenities,
      planPicker: {
        ...prev.planPicker,
        plan: recommendPlan(amenities),
      },
    }));
  }, []);

  const setPlanPicker = useCallback((planPicker: PlanPickerValue) => {
    setState(prev => ({ ...prev, planPicker }));
  }, []);

  const canAdvanceFromBuilding = !!(
    state.buildingName.trim() &&
    state.addressQuery.trim()
  );

  const canAdvanceFromPlan = state.planPicker.plan !== null;

  const canSubmit = !!(
    state.firstName.trim() &&
    state.lastName.trim() &&
    state.email.trim() &&
    state.password.length >= 6
  );

  const goNext = useCallback(() => {
    setState(prev => {
      if (prev.step === 'building' && canAdvanceFromBuilding) return { ...prev, step: 'plan' };
      if (prev.step === 'plan' && canAdvanceFromPlan) return { ...prev, step: 'account' };
      return prev;
    });
  }, [canAdvanceFromBuilding, canAdvanceFromPlan]);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.step === 'account') return { ...prev, step: 'plan' };
      if (prev.step === 'plan') return { ...prev, step: 'building' };
      return prev;
    });
  }, []);

  return {
    state,
    set,
    setStep,
    setAmenities,
    setPlanPicker,
    canAdvanceFromBuilding,
    canAdvanceFromPlan,
    canSubmit,
    goNext,
    goBack,
  };
}
