import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import AppShell from '@/components/layout/AppShell';
import { applyUrlOverride, useUx2 } from '../flags';
import Ux2Shell from './Ux2Shell';

/**
 * Picks the shell by the ux2.shell flag and lets a ?ux2= query turn flags on
 * or off for this browser (handy for staging validation).
 */
export default function ShellSwitch() {
  const location = useLocation();
  useEffect(() => { applyUrlOverride(location.search); }, [location.search]);
  const on = useUx2('shell');
  return on ? <Ux2Shell /> : <AppShell />;
}
