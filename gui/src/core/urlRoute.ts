// urlRoute.ts — deep links to a model, the tab it is open on, and a bundle plugin view
//
// Three forms of link:
//   /model/<model path>/<tab>                   a model on overview, sim or opt
//   /model/<model path>/plugin/<plugin id>      a plugin view with that model selected
//   /plugin/<plugin id>                         a plugin view with no model selected
// A plugin link may end in ?m=<model path>&m=<model path> for the models ticked in the model tree.
// The model path is the key the file tree uses, so it is stable and readable. The server answers
// every path with index.html (Nginx try_files, Vite dev server), so nothing but this file decides
// what a path means.

export type CenterTab = 'intro' | 'simulation' | 'optimization' | 'builder';

export type RouteTab = 'overview' | 'sim' | 'opt';

export interface PageRoute {
  // null for a plugin link that names no model
  key: string | null;
  tab: RouteTab;
  plugin: string | null;
  // models ticked in the tree, only with a plugin
  models: string[];
}

const MODEL_PREFIX = '/model/';
const PLUGIN_PREFIX = '/plugin/';
const PLUGIN_ID = /^[A-Za-z0-9_-]+$/;

const TAB_TO_CENTER: Record<RouteTab, CenterTab> = {
  overview: 'intro',
  sim: 'simulation',
  opt: 'optimization',
};

export const routeTabToCenterTab = (tab: RouteTab): CenterTab => TAB_TO_CENTER[tab];

export const centerTabToRouteTab = (tab: CenterTab): RouteTab | null =>
  tab === 'intro' ? 'overview' : tab === 'simulation' ? 'sim' : tab === 'optimization' ? 'opt' : null;

const isModelKey = (key: string) => /\.ya?ml$/i.test(key) && !key.split('/').includes('..');

export function parseRoute(pathname: string, search = ''): PageRoute | null {
  try {
    const models = new URLSearchParams(search).getAll('m').filter(isModelKey);
    if (pathname.startsWith(PLUGIN_PREFIX)) {
      const parts = pathname.slice(PLUGIN_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
      if (parts.length !== 1 || !PLUGIN_ID.test(parts[0])) return null;
      return { key: null, tab: 'overview', plugin: parts[0], models };
    }
    if (!pathname.startsWith(MODEL_PREFIX)) return null;
    const parts = pathname.slice(MODEL_PREFIX.length).split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length >= 3 && parts[parts.length - 2] === 'plugin') {
      const plugin = parts[parts.length - 1];
      const key = parts.slice(0, -2).join('/');
      if (!PLUGIN_ID.test(plugin) || !isModelKey(key)) return null;
      return { key, tab: 'overview', plugin, models };
    }
    if (parts.length < 2) return null;
    const tab = parts[parts.length - 1] as RouteTab;
    const key = parts.slice(0, -1).join('/');
    if (!(tab in TAB_TO_CENTER) || !isModelKey(key)) return null;
    return { key, tab, plugin: null, models: [] };
  } catch {
    return null;
  }
}

const encodePath = (key: string) => key.split('/').map(encodeURIComponent).join('/');

// Models imported into the session ('session/...') exist only in the visitor's own browser, so they get no link.
export function buildPath(
  key: string | null, tab: CenterTab, plugin: string | null = null, models: string[] = [],
): string {
  const linkable = key && !key.startsWith('session/') ? key : null;
  if (plugin) {
    const base = linkable ? `${MODEL_PREFIX}${encodePath(linkable)}/plugin/${plugin}` : `${PLUGIN_PREFIX}${plugin}`;
    const query = new URLSearchParams();
    models.filter(m => !m.startsWith('session/')).forEach(m => query.append('m', m));
    const qs = query.toString();
    return qs ? `${base}?${qs}` : base;
  }
  const routeTab = centerTabToRouteTab(tab);
  if (!linkable || !routeTab) return '/';
  return `${MODEL_PREFIX}${encodePath(linkable)}/${routeTab}`;
}

// The link in the address bar when the page was opened. Read once, so the restore of the previously
// selected model (kept in localStorage) yields to the link.
let initialRoute: PageRoute | null | undefined;
export function getInitialRoute(): PageRoute | null {
  if (initialRoute === undefined) initialRoute = parseRoute(window.location.pathname, window.location.search);
  return initialRoute;
}
