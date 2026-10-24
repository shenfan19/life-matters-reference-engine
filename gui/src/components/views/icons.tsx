// gui/src/components/views/icons.tsx
// Draws a view icon on a 24 by 24 grid in the current color, the style of the built-in views.

import React from 'react';

export const svg = (children: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
