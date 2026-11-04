import React from 'react';
import { AbsoluteFill, Audio, Composition, Sequence, staticFile } from 'remotion';
import { FPS, HEIGHT, WIDTH } from './theme';
import { shot, TOTAL_FRAMES } from './timeline';
import { MEDIA } from './media';
import { Fonts } from './components/Fonts';
import { AudioTracks } from './components/AudioTracks';

// Shot components
import { Shot1Open } from './shots/Shot1Open';
import { Shot2Layers } from './shots/Shot2Layers';
import { Shot3Thesis } from './shots/Shot3Thesis';
import { Shot4SlotA } from './shots/Shot4SlotA';
import { Shot5SlotB } from './shots/Shot5SlotB';
import { Shot6SlotC } from './shots/Shot6SlotC';
import { Shot7Return } from './shots/Shot7Return';
import { Shot8End } from './shots/Shot8End';

export const FilmSequence: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: '#f0ecdf' }}>
      <Fonts />
      {/* 0:00 - 0:10 | Macro Open */}
      <Sequence {...shot('open')}>
        <Shot1Open />
      </Sequence>

      {/* 0:10 - 0:27 | 3D Layer Explosion */}
      <Sequence {...shot('layers')}>
        <Shot2Layers />
      </Sequence>

      {/* 0:27 - 0:43 | The Three Principles */}
      <Sequence {...shot('thesis')}>
        <Shot3Thesis />
      </Sequence>

      {/* 0:43 - 1:02 | Product Slot A: Scale & Intake */}
      <Sequence {...shot('slotA')}>
        <Shot4SlotA />
      </Sequence>

      {/* 1:02 - 1:23 | Product Slot B: Takeoff Review */}
      <Sequence {...shot('slotB')}>
        <Shot5SlotB />
      </Sequence>

      {/* 1:23 - 1:43 | Product Slot C: Grounded Copilot */}
      <Sequence {...shot('slotC')}>
        <Shot6SlotC />
      </Sequence>

      {/* 1:43 - 1:55 | Return to Vellum */}
      <Sequence {...shot('return')}>
        <Shot7Return />
      </Sequence>

      {/* 1:55 - 2:00 | Apple Minimalist Close */}
      <Sequence {...shot('end')}>
        <Shot8End />
      </Sequence>

      {/* Master Audio Track: Ambient Bed + Kokoro Narration */}
      <AudioTracks />

      {/* Optional Voiceover Audio Track (Meta Model API Narration) */}
      {MEDIA.voiceover && (
        <Audio src={staticFile(MEDIA.voiceover)} />
      )}
    </AbsoluteFill>
  );
};

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="BlueTraceFilm"
      component={FilmSequence}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
