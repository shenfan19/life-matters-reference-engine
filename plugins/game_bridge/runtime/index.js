/* The game-neutral computational core of the game bridge. A game imports from here and nowhere else in this folder.
     import { LMCore, LookupCore } from './runtime/index.js';
   Both cores answer the same interface, see docs/README_core_interface.md of the plugin this folder was copied from. */
export { LMCore, CoreError } from './lm_core.js';
export { LookupCore, LookupError } from './lookup_core.js';
export { compile } from './expr.js';
export { RUNTIME_VERSION, CONTRACT_VERSION } from './version.js';
