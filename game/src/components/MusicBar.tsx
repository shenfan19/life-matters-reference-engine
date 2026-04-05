// MusicBar — shared music player for StorySelect and CardGame
//
// State logic:
//   playing  is initialized from localStorage so page transitions inherit on/off.
//   Effect [idx, playTick] is the SOLE start trigger — fires on mount (idx=0,
//   playTick=0) and on every track advance. No separate "restore on mount" effect.
//   Cleanup on unmount stops all audio (HTML + MIDI + Web Audio nodes) before the
//   next page's MusicBar starts.

import { useState, useEffect, useRef } from 'react';
import MidiPlayer from 'midi-player-js';
import Soundfont from 'soundfont-player';

const PREF_KEY = 'music_playing_pref';
const isMidi   = (url: string) => /\.(mid|midi)$/i.test(url.split('?')[0]);

export default function MusicBar({ tracks, c, fs }: { tracks: string[]; c: any; fs: any }) {
  const [playing,  setPlaying]  = useState(() => localStorage.getItem(PREF_KEY) !== 'false');
  const [idx,      setIdx]      = useState(0);
  const [playTick, setPlayTick] = useState(0);

  const playingRef    = useRef(playing);   // initialise to match state (not false)
  const audioRef      = useRef<HTMLAudioElement>(null);
  const acRef         = useRef<AudioContext | null>(null);
  const instrumentRef = useRef<any>(null);
  const midiPlayerRef = useRef<any>(null);
  const midiBufRef    = useRef<ArrayBuffer | null>(null);
  const midiBufUrlRef = useRef<string>('');

  // Keep ref in sync so closures always see latest value
  useEffect(() => { playingRef.current = playing; }, [playing]);

  // Persist on/off preference
  useEffect(() => {
    localStorage.setItem(PREF_KEY, String(playing));
  }, [playing]);

  // ── Stop everything on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      midiPlayerRef.current?.stop();
      instrumentRef.current?.stop();
      acRef.current?.close().catch(() => {});
      acRef.current = null;
      instrumentRef.current = null;
    };
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const stopCurrent = () => {
    audioRef.current?.pause();
    midiPlayerRef.current?.stop();
    instrumentRef.current?.stop();
  };

  const onTrackEnd = () => {
    if (!playingRef.current) return;
    if (tracks.length > 1) {
      setIdx(i => (i + 1) % tracks.length);
    } else {
      setPlayTick(t => t + 1);
    }
  };

  const startMidi = async (url: string) => {
    if (!acRef.current) acRef.current = new AudioContext();
    const ac = acRef.current;
    if (ac.state === 'suspended') await ac.resume();

    if (!instrumentRef.current) {
      instrumentRef.current = await Soundfont.instrument(ac, 'acoustic_grand_piano' as any);
    }

    let buf: ArrayBuffer;
    if (midiBufUrlRef.current === url && midiBufRef.current) {
      buf = midiBufRef.current.slice(0);
    } else {
      buf = await fetch(url).then(r => r.arrayBuffer());
      midiBufRef.current    = buf.slice(0);
      midiBufUrlRef.current = url;
    }

    const instrument = instrumentRef.current;
    const player = new MidiPlayer.Player((event: any) => {
      if (event.name === 'Note on' && event.velocity > 0) {
        instrument.play(String(event.noteName), ac.currentTime, { gain: event.velocity / 127 });
      }
    });
    player.loadArrayBuffer(buf);
    player.on('endOfFile', onTrackEnd);
    midiPlayerRef.current = player;
    player.play();
  };

  // ── Sole start trigger: fires on mount (idx=0, playTick=0) and on track advance
  useEffect(() => {
    if (!playingRef.current || !tracks.length) return;
    const url = tracks[idx];
    if (!url) return;
    stopCurrent();
    if (isMidi(url)) {
      startMidi(url).catch(() => setPlaying(false));
    } else {
      const el = audioRef.current;
      if (!el) return;
      el.src = url; el.load();
      el.play().catch(() => setPlaying(false));
    }
  }, [idx, playTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle ───────────────────────────────────────────────────────────────────
  const toggle = async () => {
    const url = tracks[idx];
    if (!url) return;
    if (playing) {
      stopCurrent();
      setPlaying(false);
    } else {
      setPlaying(true);
      playingRef.current = true;
      if (isMidi(url)) {
        await startMidi(url).catch(() => setPlaying(false));
      } else {
        const el = audioRef.current;
        if (!el) return;
        if (!el.src || el.src === window.location.href) { el.src = url; el.load(); }
        el.play().catch(() => setPlaying(false));
      }
    }
  };

  // ── Next ─────────────────────────────────────────────────────────────────────
  const handleNext = () => {
    stopCurrent();
    if (tracks.length > 1) {
      setIdx(i => (i + 1) % tracks.length);
    } else if (playingRef.current) {
      setPlayTick(t => t + 1);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const filename = tracks[idx]?.split('/').pop()?.replace(/\.[^.]+$/, '') ?? '';

  const btnStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    color: c.textSec, fontSize: 13, padding: '0 3px', lineHeight: 1,
    display: 'flex', alignItems: 'center', flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
      <audio ref={audioRef} onEnded={onTrackEnd} style={{ display: 'none' }} />
      <div style={{ width: 1, height: 14, background: c.border, marginRight: 4 }} />
      <button style={btnStyle} onClick={toggle} title={playing ? '暂停' : '播放'}>
        {playing ? '⏸' : '▶'}
      </button>
      <button style={btnStyle} onClick={handleNext} title="下一曲">⏭</button>
      <span style={{
        color: c.textMute, fontSize: fs.xs, marginLeft: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120,
      }}>
        {filename}
      </span>
      <span style={{
        color: c.textMute, fontFamily: 'monospace', fontSize: fs.xs,
        marginLeft: 3, flexShrink: 0, opacity: 0.5,
      }}>
        {idx + 1}/{tracks.length}
      </span>
      <div style={{ width: 1, height: 14, background: c.border, marginLeft: 4 }} />
    </div>
  );
}
