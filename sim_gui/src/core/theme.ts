export function getC(dark: boolean) {
  return dark ? {
    bg: '#111111', panel: '#1a1a1a', border: '#2a2a2a',
    primary: '#52c41a', text: 'rgba(255,255,255,0.92)',
    textSec: 'rgba(255,255,255,0.75)', textMute: 'rgba(255,255,255,0.52)',
    inputBg: '#222222', sectionHd: '#111111', rowHover: 'rgba(82,196,26,0.1)',
    activeBg: '#1a3a22', navHover: 'rgba(82,196,26,0.08)',
  } : {
    bg: '#f5f5f5', panel: '#ffffff', border: '#e0e0e0',
    primary: '#007A33', text: '#1a2e22',
    textSec: '#6b7280', textMute: 'rgba(0,0,0,0.55)',
    inputBg: '#ffffff', sectionHd: '#efefef', rowHover: 'rgba(0,122,51,0.07)',
    activeBg: '#e8f5e9', navHover: 'rgba(0,122,51,0.06)',
  };
}
