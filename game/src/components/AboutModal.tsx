// AboutModal — project + author info overlay (i18n-aware)
import { GithubOutlined, MailOutlined, HomeOutlined } from '@ant-design/icons';
import { useI18n } from '../core/i18n';

export const AUTHOR = {
  name: 'Fan Shen',
  email: 'shenfan@mail.sysu.edu.cn',
  github: 'https://github.com/shenfan19',
  homepage: '',   // fill in when ready
  version: 'v0.4.0',
};

export default function AboutModal({ open, onClose, c, fs }: {
  open: boolean; onClose: () => void; c: any; fs: any;
}) {
  if (!open) return null;

  const { t } = useI18n();

  const linkStyle: React.CSSProperties = {
    color: 'inherit', textDecoration: 'none',
    display: 'flex', alignItems: 'center', gap: 8,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.panel,
          borderRadius: 14, padding: '32px 40px',
          maxWidth: 420, width: '90%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.55)',
          textAlign: 'center',
        }}
      >
        {/* App title */}
        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'Georgia, serif', color: c.text, marginBottom: 6 }}>
          {t('about.name')}
        </div>

        {/* Subtitle */}
        <div style={{ color: c.textMute, fontSize: fs.sm, lineHeight: 1.6, marginBottom: 4 }}>
          {t('about.subtitle')}
        </div>

        {/* Version + license */}
        <div style={{ color: c.textMute, fontFamily: 'monospace', fontSize: fs.xs, marginTop: 8, marginBottom: 24 }}>
          {AUTHOR.version} · MIT License
        </div>

        {/* Author block */}
        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, marginBottom: 20 }}>
          <div style={{ color: c.text, fontWeight: 600, fontSize: fs.md, marginBottom: 4 }}>{AUTHOR.name}</div>
          <div style={{ color: c.textMute, fontSize: fs.sm, marginBottom: 16 }}>{t('about.affiliation')}</div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: c.textSec, fontSize: fs.sm }}>
            <a href={`mailto:${AUTHOR.email}`} style={linkStyle}>
              <MailOutlined /> {AUTHOR.email}
            </a>
            <a href={AUTHOR.github} target="_blank" rel="noreferrer" style={linkStyle}>
              <GithubOutlined /> github.com/shenfan19
            </a>
            {AUTHOR.homepage ? (
              <a href={AUTHOR.homepage} target="_blank" rel="noreferrer" style={linkStyle}>
                <HomeOutlined /> {AUTHOR.homepage}
              </a>
            ) : (
              <span style={{ color: c.textMute, opacity: 0.3, display: 'flex', alignItems: 'center', gap: 8 }}>
                <HomeOutlined /> {t('about.homepage')} —
              </span>
            )}
          </div>
        </div>

        {/* Disclaimer block */}
        <div style={{ borderTop: `1px solid ${c.border}`, paddingTop: 20, textAlign: 'left' }}>
          <div style={{ fontSize: fs.md, fontWeight: 700, color: c.textSec, marginBottom: 12 }}>
            {t('disclaimer.title')}
          </div>
          <div style={{ fontSize: fs.sm, color: c.textSec, lineHeight: 1.65, marginBottom: 12 }}>
            {t('disclaimer.intro')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.isArray(t('disclaimer.points')) && (t('disclaimer.points') as string[]).map((p, i) => (
              <div key={i} style={{ fontSize: fs.sm, color: c.textSec, display: 'flex', gap: 10, lineHeight: 1.5 }}>
                <span style={{ color: c.primary, flexShrink: 0, marginTop: 1 }}>·</span>
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 28, padding: '7px 28px', borderRadius: 8,
            border: `1px solid ${c.border}`, background: 'none',
            color: c.textMute, cursor: 'pointer', fontSize: fs.sm,
          }}
        >
          {t('about.close')}
        </button>
      </div>
    </div>
  );
}
