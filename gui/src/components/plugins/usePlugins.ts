// gui/src/components/plugins/usePlugins.ts
// Lists the bundle plugins the backend has found, in the order their manifests ask for.

import { useEffect, useState } from 'react';
import { API_BASE } from '../sim_tab/simUtils';

export interface BundlePlugin {
  id: string;
  title: string;
  icon?: string;
  order: number;
}

export function usePlugins(): BundlePlugin[] {
  const [plugins, setPlugins] = useState<BundlePlugin[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/plugins`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !Array.isArray(data?.plugins)) return;
        const bundles: BundlePlugin[] = data.plugins
          .filter((m: any) => m?.ui?.type === 'bundle')
          .map((m: any) => ({
            id: m.id,
            title: m.ui.title || m.name || m.id,
            icon: m.ui.icon,
            order: typeof m.ui.order === 'number' ? m.ui.order : 1000,
          }))
          .sort((a: BundlePlugin, b: BundlePlugin) => a.order - b.order || a.title.localeCompare(b.title));
        setPlugins(bundles);
      })
      .catch(() => { /* no plugin system reachable: the strip simply stays hidden */ });
    return () => { cancelled = true; };
  }, []);

  return plugins;
}
