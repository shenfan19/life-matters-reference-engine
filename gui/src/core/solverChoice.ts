// gui/src/core/solverChoice.ts
// Which solver the simulations and optimizations of this browser run on. The list comes from the
// backend (GET /api/solvers); the choice is kept in the browser. An empty choice means the
// backend's own default, so a browser that never chose follows whatever the server is set to.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'lm_solver';

export interface SolverInfo { id: string; version: string; capabilities: string[] }

export function getSolverChoice(): string {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

// Fields to spread into a request body: nothing when no solver was chosen.
export function solverField(): { solver?: string } {
  const id = getSolverChoice();
  return id ? { solver: id } : {};
}

export function useSolvers(apiBase: string) {
  const [solvers, setSolvers] = useState<SolverInfo[]>([]);
  const [choice, setChoice] = useState<string>(getSolverChoice);

  useEffect(() => {
    let cancelled = false;
    fetch(`${apiBase}/solvers`)
      .then(r => r.json())
      .then(d => { if (!cancelled && Array.isArray(d?.solvers)) setSolvers(d.solvers); })
      .catch(() => { /* an older backend has no solver list: the selector stays hidden */ });
    return () => { cancelled = true; };
  }, [apiBase]);

  const choose = useCallback((id: string) => {
    setChoice(id);
    try { localStorage.setItem(KEY, id); } catch { /* the choice is just not remembered */ }
  }, []);

  // a remembered solver the backend does not have any more counts as no choice
  const valid = solvers.some(s => s.id === choice) ? choice : '';
  return { solvers, choice: valid, choose };
}
