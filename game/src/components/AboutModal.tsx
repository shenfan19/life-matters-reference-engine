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
    display: 'flex', alignItems: 'center', gap: 6,
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
          background: c.panel, border: `1px solid ${c.border}`,
          borderRadius: 12, padding: '28px 40px',
          maxWidth: 380, width: '90%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          textAlign: 'center',
        }}
      >
        {/* App title */}
        <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'Georgia, serif', color: c.text, marginBottom: 6 }}>
          {t('app.title')}
        </div>

        {/* Subtitle(s) */}
        <div style={{ color: c.textMute, fontSize: fs.sm, lineHeight: 1.7 }}>
          {t('about.subtitle')}
        </div>

        {/* Version + license — right below subtitle */}
        <div style={{ color: c.textMute, fontFamily: 'monospace', fontSize: fs.xs, marginTop: 10, marginBottom: 18 }}>
          {AUTHOR.version} · MIT License
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${c.border}`, marginBottom: 16 }} />

        {/* Author */}
        <div style={{ color: c.text, fontWeight: 600, marginBottom: 2 }}>{AUTHOR.name}</div>
        <div style={{ color: c.textMute, fontSize: fs.sm, marginBottom: 14 }}>{t('about.affiliation')}</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, color: c.textSec, fontSize: fs.sm }}>
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
            <span style={{ color: c.textMute, opacity: 0.35, display: 'flex', alignItems: 'center', gap: 6 }}>
              <HomeOutlined /> {t('about.homepage')} —
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: 22, padding: '5px 22px', borderRadius: 6,
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
