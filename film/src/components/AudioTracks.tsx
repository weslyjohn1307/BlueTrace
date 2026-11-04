import React from 'react';
import { Audio, Sequence, staticFile } from 'remotion';
import { s } from '../theme';

/**
 * Complete Master Audio Track:
 * 1. Background Ambient Score (120s loop / bed with gentle ducking)
 * 2. Kokoro-82M Studio Voiceover Narration (Shots 1 through 8)
 * 3. Kinetic Precision UI SFX & Foley
 */
export const AudioTracks: React.FC = () => {
  return (
    <>
      {/* ------------------------------------------------------------- */}
      {/* 1. BACKGROUND AMBIENT SCORE (120s Bed)                        */}
      {/* ------------------------------------------------------------- */}
      <Audio
        src={staticFile('audio/music_bed.wav')}
        volume={(f) => {
          // Fade in over first 2.5s, sit gently at 0.18 under voiceover, fade out at end
          if (f < s(2.5)) return (f / s(2.5)) * 0.22;
          if (f > s(117)) return Math.max(0, (1 - (f - s(117)) / s(3.0))) * 0.22;
          return 0.18;
        }}
      />

      {/* ------------------------------------------------------------- */}
      {/* 2. KOKORO-82M VOICEOVER NARRATION                             */}
      {/* ------------------------------------------------------------- */}
      {/* Shot 1: Open / Brand Reveal (VO starts at 0.8s) */}
      <Sequence from={s(0.8)} durationInFrames={s(8.2)}>
        <Audio src={staticFile('audio/vo_shot1.wav')} volume={0.95} />
      </Sequence>

      {/* Shot 2: Layers Lift (VO starts at 11.0s) */}
      <Sequence from={s(11.0)} durationInFrames={s(14.0)}>
        <Audio src={staticFile('audio/vo_shot2.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 3: Thesis Principles (VO starts at 28.0s) */}
      <Sequence from={s(28.0)} durationInFrames={s(10.0)}>
        <Audio src={staticFile('audio/vo_shot3.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 4: Slot A / Scale & Intake (VO starts at 44.0s) */}
      <Sequence from={s(44.0)} durationInFrames={s(14.0)}>
        <Audio src={staticFile('audio/vo_shot4.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 5: Slot B / Takeoff Review (VO starts at 63.5s) */}
      <Sequence from={s(63.5)} durationInFrames={s(10.0)}>
        <Audio src={staticFile('audio/vo_shot5.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 6: Slot C / Grounded Copilot (VO starts at 84.5s) */}
      <Sequence from={s(84.5)} durationInFrames={s(10.0)}>
        <Audio src={staticFile('audio/vo_shot6.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 7: Return to Vellum (VO starts at 104.5s) */}
      <Sequence from={s(104.5)} durationInFrames={s(9.5)}>
        <Audio src={staticFile('audio/vo_shot7.wav')} volume={0.92} />
      </Sequence>

      {/* Shot 8: Minimalist Close (VO starts at 115.8s) */}
      <Sequence from={s(115.8)} durationInFrames={s(4.0)}>
        <Audio src={staticFile('audio/vo_shot8.wav')} volume={0.95} />
      </Sequence>

      {/* ------------------------------------------------------------- */}
      {/* 3. KINETIC UI SOUND EFFECTS (FOLEY)                           */}
      {/* ------------------------------------------------------------- */}
      {/* SFX: 3D Folded Ribbon Assembly (f: 15) */}
      <Sequence from={15} durationInFrames={55}>
        <Audio src={staticFile('audio/sfx_brand_assemble.wav')} volume={0.7} />
      </Sequence>

      {/* SFX: Specular Light Glint Shimmer (f: 45) */}
      <Sequence from={45} durationInFrames={52}>
        <Audio src={staticFile('audio/sfx_specular_glint.wav')} volume={0.65} />
      </Sequence>

      {/* SFX: CAD Workstation Window Swoop & Landing (f: 335) */}
      <Sequence from={335} durationInFrames={48}>
        <Audio src={staticFile('audio/sfx_workstation_swoop.wav')} volume={0.6} />
      </Sequence>

      {/* SFX: Duct Selection Click & Dimension Lock (f: 500) */}
      <Sequence from={500} durationInFrames={20}>
        <Audio src={staticFile('audio/sfx_duct_click.wav')} volume={0.85} />
      </Sequence>

      {/* SFX: Vellum Layer Separation (Shot 2, f: 690 / 11.5s) */}
      <Sequence from={s(11.5)} durationInFrames={85}>
        <Audio src={staticFile('audio/sfx_vellum_layer_lift.wav')} volume={0.55} />
      </Sequence>

      {/* SFX: Authoritative End Resolution Chime (Shot 8, f: 6920 / 115.3s) */}
      <Sequence from={s(115.3)} durationInFrames={170}>
        <Audio src={staticFile('audio/sfx_end_chime.wav')} volume={0.75} />
      </Sequence>
    </>
  );
};
