/**
 * BATHYS Procedural Web Audio Engine
 * - Starts on the opening click
 * - Tactile headlamp switch click + deep underwater swell
 * - Restrained instrumental ambient chord pad + seamless ocean ambience
 * - Thruster hum scaling smoothly with vehicle speed
 * - Directional camera transition whooshes
 * - Cockpit crossfade (muffled exterior + quiet pressurized cabin hum)
 * - Dive Archive crossfade
 * - Persistent mute/unmute state
 */
export class BathysAudio {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private exteriorFilter: BiquadFilterNode | null = null;
  private exteriorGain: GainNode | null = null;
  private cabinGain: GainNode | null = null;
  private thrusterOsc: OscillatorNode | null = null;
  private thrusterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private started = false;
  private muted = false;
  private inCockpit = false;
  private inArchive = false;

  public start(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.started = true;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.78;
    this.masterGain.connect(this.ctx.destination);

    // Exterior underwater bus with filter for cockpit muffling
    this.exteriorFilter = this.ctx.createBiquadFilter();
    this.exteriorFilter.type = 'lowpass';
    this.exteriorFilter.frequency.value = 920;
    this.exteriorFilter.Q.value = 0.8;

    this.exteriorGain = this.ctx.createGain();
    this.exteriorGain.gain.value = 0.55;
    this.exteriorFilter.connect(this.exteriorGain);
    this.exteriorGain.connect(this.masterGain);

    // Seamless pink noise underwater ambience
    const bufferSize = this.ctx.sampleRate * 4;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }
    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.value = 0.65;
    noiseSrc.connect(noiseGain);
    noiseGain.connect(this.exteriorFilter);
    noiseSrc.start();

    // Restrained instrumental ambient pad (deep D-minor / suspended 9th harmonic drone)
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.14;
    const padFilter = this.ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 460;
    padFilter.connect(this.musicGain);
    this.musicGain.connect(this.masterGain);

    const freqs = [73.42, 110.0, 146.83, 220.0, 261.63]; // D2, A2, D3, A3, C4
    freqs.forEach((f, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      osc.type = idx < 2 ? 'sine' : 'triangle';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = idx < 2 ? 0.24 : 0.09;
      osc.connect(g);
      g.connect(padFilter);
      osc.start();
    });

    // Thruster hum (scales smoothly with speed)
    this.thrusterOsc = this.ctx.createOscillator();
    this.thrusterOsc.type = 'sawtooth';
    this.thrusterOsc.frequency.value = 46;
    const thrFilter = this.ctx.createBiquadFilter();
    thrFilter.type = 'lowpass';
    thrFilter.frequency.value = 140;
    this.thrusterGain = this.ctx.createGain();
    this.thrusterGain.gain.value = 0.015;
    this.thrusterOsc.connect(thrFilter);
    thrFilter.connect(this.thrusterGain);
    this.thrusterGain.connect(this.exteriorFilter);
    this.thrusterOsc.start();

    // Quiet pressurized cockpit cabin hum
    this.cabinGain = this.ctx.createGain();
    this.cabinGain.gain.value = 0.0;
    const cabinOsc = this.ctx.createOscillator();
    cabinOsc.type = 'sine';
    cabinOsc.frequency.value = 62;
    const cabinOsc2 = this.ctx.createOscillator();
    cabinOsc2.type = 'sine';
    cabinOsc2.frequency.value = 124.5;
    const c2g = this.ctx.createGain();
    c2g.gain.value = 0.25;
    cabinOsc.connect(this.cabinGain);
    cabinOsc2.connect(c2g);
    c2g.connect(this.cabinGain);
    this.cabinGain.connect(this.masterGain);
    cabinOsc.start();
    cabinOsc2.start();
  }

  public playHeadlampSwitch(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    // Crisp tactile metallic switch click
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.22, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public playIlluminationSwell(): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(42, now);
    osc.frequency.exponentialRampToValueAtTime(84, now + 1.8);
    osc.frequency.exponentialRampToValueAtTime(52, now + 3.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.32, now + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 3.8);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 3.9);
  }

  public playCameraMove(panDirection: number): void {
    if (!this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(165, now + 0.7);
    osc.frequency.exponentialRampToValueAtTime(70, now + 1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 260;
    filter.Q.value = 2.0;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.45);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 1.55);

    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(-panDirection * 0.6, now);
    panner.pan.linearRampToValueAtTime(panDirection * 0.6, now + 1.4);

    osc.connect(filter);
    filter.connect(g);
    g.connect(panner);
    panner.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 1.6);
  }

  public playUiTick(): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(640, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.04);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.05);
  }

  public setSpeed(speedRatio: number): void {
    if (!this.ctx || !this.thrusterOsc || !this.thrusterGain) return;
    const clamped = Math.max(0, Math.min(1, speedRatio));
    const now = this.ctx.currentTime;
    this.thrusterOsc.frequency.setTargetAtTime(44 + clamped * 68, now, 0.12);
    this.thrusterGain.gain.setTargetAtTime(0.014 + clamped * 0.11, now, 0.12);
  }

  public setCockpitMode(inside: boolean): void {
    this.inCockpit = inside;
    this.applyMix();
  }

  public setArchiveMode(archive: boolean): void {
    this.inArchive = archive;
    this.applyMix();
  }

  private applyMix(): void {
    if (!this.ctx || !this.exteriorFilter || !this.exteriorGain || !this.cabinGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    if (this.inArchive) {
      this.exteriorFilter.frequency.setTargetAtTime(190, now, 0.45);
      this.exteriorGain.gain.setTargetAtTime(0.14, now, 0.45);
      this.cabinGain.gain.setTargetAtTime(0.0, now, 0.35);
      this.musicGain.gain.setTargetAtTime(0.10, now, 0.45);
    } else if (this.inCockpit) {
      this.exteriorFilter.frequency.setTargetAtTime(240, now, 0.35);
      this.exteriorGain.gain.setTargetAtTime(0.28, now, 0.35);
      this.cabinGain.gain.setTargetAtTime(0.085, now, 0.35);
      this.musicGain.gain.setTargetAtTime(0.13, now, 0.35);
    } else {
      this.exteriorFilter.frequency.setTargetAtTime(960, now, 0.35);
      this.exteriorGain.gain.setTargetAtTime(0.55, now, 0.35);
      this.cabinGain.gain.setTargetAtTime(0.0, now, 0.35);
      this.musicGain.gain.setTargetAtTime(0.15, now, 0.35);
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : 0.78, this.ctx.currentTime, 0.08);
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }
}
