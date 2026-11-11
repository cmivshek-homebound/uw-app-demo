import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { DEMO_STEPS, DemoContext } from '../data/demo';

const ON_KEY = 'uw-demo:on';
const STEP_KEY = 'uw-demo:step';

// Storage can be unavailable (private windows, blocked site data); demo mode
// still works for the session, it just won't be remembered.
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function clampStep(n: number): number {
  return Number.isInteger(n) && n >= 0 && n < DEMO_STEPS.length ? n : 0;
}

/** Demo toggle and the presenter's current step, remembered across reloads. */
export default function DemoProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(() => read(ON_KEY) === '1');
  const [step, setStepState] = useState(() => clampStep(Number(read(STEP_KEY) ?? 0)));

  const setOn = useCallback((next: boolean) => {
    setOnState(next);
    write(ON_KEY, next ? '1' : '0');
  }, []);

  const setStep = useCallback((next: number) => {
    const s = clampStep(next);
    setStepState(s);
    write(STEP_KEY, String(s));
  }, []);

  const value = useMemo(() => ({ on, step, setOn, setStep }), [on, step, setOn, setStep]);
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
