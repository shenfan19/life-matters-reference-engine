declare module 'midi-player-js' {
  class Player {
    constructor(cb: (event: any) => void);
    loadArrayBuffer(buf: ArrayBuffer): void;
    play(): void;
    stop(): void;
    isPlaying(): boolean;
    on(event: string, cb: () => void): void;
  }
  export default { Player };
}

declare module 'soundfont-player' {
  interface InstrumentNode {
    play(note: string, when: number, opts?: Record<string, any>): void;
    stop(): void;
  }
  function instrument(ac: AudioContext, name: string, opts?: any): Promise<InstrumentNode>;
  export default { instrument };
}
