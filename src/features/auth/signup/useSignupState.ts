// State machine for the 2-step signup wizard.
// Steps: plan → details

import { useState, useCallback } from 'react';
import type { PlanId, BillingInterval } from '@/lib/tiers';
import type { PlanPickerValue } from '@/features/subscription/PlanPicker';
import type { BoardRoleKey } from '@/types/auth';
import { isValidName, isValidEmail, isStrongPassword } from '@/lib/validation';

export type SignupStep = 'plan' | 'details';

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

  // Step 1: Plan
  planPicker: PlanPickerValue;

  // Step 2: Details (building + account)
  buildingName: string;
  addressQuery: string;
  addressResult: AddressResult | null;
  addressLoading: boolean;
  totalUnits: number | '';

  firstName: string;
  lastName: string;
  email: string;
  password: string;
  iAmRole: 'board_member' | 'resident' | 'property_manager' | 'other' | null;
  roleKey: BoardRoleKey | null;
}

function readUrlParams(): { plan: PlanId | null; interval: BillingInterval } {
  const params = new URLSearchParams(window.location.search);
  let plan: PlanId | null = null;
  if (params.get('plan') === 'facilities') plan = 'facilities';
  else if (params.get('plan') === 'self_managed') plan = 'self_managed';
  const interval: BillingInterval = params.get('interval') === 'annual' ? 'annual' : 'monthly';
  return { plan, interval };
}

const urlParams = readUrlParams();

const INITIAL_STATE: SignupState = {
  step: 'plan',
  planPicker: {
    plan: urlParams.plan,
    interval: urlParams.interval,
    onCall: false,
    pmSeat: false,
    setup: false,
  },
  buildingName: '',
  addressQuery: '',
  addressResult: null,
  addressLoading: false,
  totalUnits: '',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  iAmRole: null,
  roleKey: null,
};

export function useSignupState() {
  const [state, setState] = useState<SignupState>(INITIAL_STATE);

  const set = useCallback(<K extends keyof SignupState>(key: K, value: SignupState[K]) => {
    setState(prev => ({ ...prev, [key]: value }));
  }, []);

  const setStep = useCallback((step: SignupStep) => {
    setState(prev => ({ ...prev, step }));
  }, []);

  const setPlanPicker = useCallback((planPicker: PlanPickerValue) => {
    setState(prev => ({ ...prev, planPicker }));
  }, []);

  const canAdvanceFromPlan = state.planPicker.plan !== null;

  const canSubmit = !!(
    state.buildingName.trim().length >= 3 &&
    state.addressQuery.trim() &&
    !state.addressLoading &&
    state.firstName.trim() &&
    state.lastName.trim() &&
    isValidName(state.firstName) &&
    isValidName(state.lastName) &&
    state.email.trim() &&
    isValidEmail(state.email) &&
    isStrongPassword(state.password)
  );

  const goNext = useCallback(() => {
    setState(prev => {
      if (prev.step === 'plan' && canAdvanceFromPlan) return { ...prev, step: 'details' };
      return prev;
    });
  }, [canAdvanceFromPlan]);

  const goBack = useCallback(() => {
    setState(prev => {
      if (prev.step === 'details') return { ...prev, step: 'plan' };
      return prev;
    });
  }, []);

  return {
    state,
    set,
    setStep,
    setPlanPicker,
    canAdvanceFromPlan,
    canSubmit,
    goNext,
    goBack,
  };
}
