/**
 * UX2 feature flags — the migration switches for the redesign.
 *
 * Every module of the redesign ships behind its own flag so the production
 * screen stays until the new one proves parity. Flags default off. They can be
 * turned on, in order of precedence:
 *
 *   1. URL:          ?ux2=shell,funds   (persisted to localStorage; ?ux2=none clears)
 *   2. localStorage: onetwo.ux2 = "shell,funds" | "all" | "none"
 *   3. Build env:    VITE_UX2_FLAGS=shell,funds   (staging can enable a set for everyone)
 *
 * Reading never throws: with no storage (SSR, tests, private windows) the env
 * value, then "off", applies.
 */
import { useSyncExternalStore } from 'react';

export const UX2_FLAGS = ['shell', 'home', 'funds', 'building', 'community', 'boardroom', 'me'] as const;
export type Ux2Flag = (typeof UX2_FLAGS)[number];

export const UX2_STORAGE_KEY = 'onetwo.ux2';
export const UX2_QUERY_PARAM = 'ux2';

type Listener = () => void;
const listeners = new Set<Listener>();
let override: string | null | undefined; // undefined = not read yet; null = nothing stored

function readEnv(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_UX2_FLAGS ?? '';
  } catch {
    return '';
  }
}

function readStorage(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(UX2_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(UX2_STORAGE_KEY);
    else localStorage.setItem(UX2_STORAGE_KEY, value);
  } catch {
    /* storage unavailable: keep the in-memory override only */
  }
}

/** Parse "shell, funds" | "all" | "none" | "" into a set of known flags. */
export function parseFlags(value: string | null | undefined): Set<Ux2Flag> {
  const out = new Set<Ux2Flag>();
  if (!value) return out;
  const parts = value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (parts.includes('none')) return out;
  if (parts.includes('all')) return new Set(UX2_FLAGS);
  for (const p of parts) if ((UX2_FLAGS as readonly string[]).includes(p)) out.add(p as Ux2Flag);
  return out;
}

function emit() {
  for (const l of listeners) l();
}

/** Apply a ?ux2= query parameter if present. Returns true when it changed the stored value. */
export function applyUrlOverride(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get(UX2_QUERY_PARAM);
    if (raw === null) return false;
    setUx2Flags(raw);
    return true;
  } catch {
    return false;
  }
}

/** Set the stored flags ("shell,funds", "all" or "none"). */
export function setUx2Flags(value: string) {
  const normalized = value.trim().toLowerCase();
  override = normalized === '' ? null : normalized;
  writeStorage(override);
  emit();
}

/** Clear any stored override so the build env (then "off") applies again. */
export function clearUx2Flags() {
  override = null;
  writeStorage(null);
  emit();
}

/** The flags in effect right now. */
export function getUx2Flags(): Set<Ux2Flag> {
  if (override === undefined) override = readStorage();
  if (override !== null) return parseFlags(override);
  return parseFlags(readEnv());
}

/** True when a flag is on. The shell flag is implied by any module flag. */
export function isUx2(flag: Ux2Flag): boolean {
  const flags = getUx2Flags();
  if (flags.has(flag)) return true;
  return flag === 'shell' && flags.size > 0;
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  return Array.from(getUx2Flags()).sort().join(',');
}

/** React hook: re-renders when flags change in this tab. */
export function useUx2(flag: Ux2Flag): boolean {
  const key = useSyncExternalStore(subscribe, snapshot, snapshot);
  const flags = parseFlags(key);
  return flags.has(flag) || (flag === 'shell' && flags.size > 0);
}

/** Test and dev helper: forget everything read so far. */
export function _resetUx2ForTests() {
  override = undefined;
  emit();
}
