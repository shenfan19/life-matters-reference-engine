// useInputEventsCRUD.ts — add/update/remove handlers for the sim and opt InputEvent lists
//
// Owns: nothing (mutates inputEvents/optInputEvents via setters passed in)
// Receives: inputVars, sessionEditedRef, invalidateSim, setInputEvents, setOptInputEvents
// Returns: sim event CRUD (addInputEvent/updateInputEvent/removeInputEvent/updateInputEventOpt)
//          + opt event CRUD (addOptInputEvent/removeOptInputEvent/updateOptInputEvent)

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { InputEvent } from '../../types';

interface UseInputEventsCRUDParams {
  inputVars: Array<{ name: string; value?: number }>;
  sessionEditedRef: MutableRefObject<boolean>;
  invalidateSim: () => void;
  setInputEvents: Dispatch<SetStateAction<InputEvent[]>>;
  setOptInputEvents: Dispatch<SetStateAction<InputEvent[]>>;
}

const blankEvent = (firstInputVar: { name: string; value?: number }, id: string, value = firstInputVar.value ?? 0): InputEvent => ({
  id, variable: firstInputVar.name, timeStart: '08:00', timeEnd: '08:00',
  value, label: '',
  daysEnabled: false, days: [true, true, true, true, true, true, true],
  validRangeEnabled: false, validStart: '', validEnd: '',
});

export function useInputEventsCRUD({
  inputVars, sessionEditedRef, invalidateSim, setInputEvents, setOptInputEvents,
}: UseInputEventsCRUDParams) {
  // ── sim input event CRUD ──────────────────────────────────────────────────────
  const addInputEvent = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => [...prev, blankEvent(firstInputVar, `ev-${Date.now()}`)]);
  };

  const updateInputEvent = (id: string, patch: Partial<InputEvent>) => {
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };

  const removeInputEvent = (id: string) => {
    sessionEditedRef.current = true;
    invalidateSim();
    setInputEvents(prev => prev.filter(ev => ev.id !== id));
  };

  // ── update opt-only fields (no sim invalidation) ─────────────────────────────
  const updateInputEventOpt = (id: string, patch: Partial<InputEvent>) =>
    setInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));

  // ── opt input event CRUD (separate from sim inputEvents) ─────────────────────
  const addOptInputEvent = () => {
    const firstInputVar = inputVars[0];
    if (!firstInputVar) return;
    sessionEditedRef.current = true;
    setOptInputEvents(prev => [...prev, blankEvent(firstInputVar, `opt-ev-${Date.now()}`, 0)]);
  };
  const removeOptInputEvent = (id: string) => {
    sessionEditedRef.current = true;
    setOptInputEvents(prev => prev.filter(ev => ev.id !== id));
  };
  const updateOptInputEvent = (id: string, patch: Partial<InputEvent>) => {
    sessionEditedRef.current = true;
    setOptInputEvents(prev => prev.map(ev => ev.id === id ? { ...ev, ...patch } : ev));
  };

  return {
    addInputEvent, updateInputEvent, removeInputEvent, updateInputEventOpt,
    addOptInputEvent, removeOptInputEvent, updateOptInputEvent,
  };
}
