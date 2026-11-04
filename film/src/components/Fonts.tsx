import React from 'react';
import { staticFile } from 'remotion';

export const Fonts: React.FC = () => {
  return (
    <style>{`
      @font-face {
        font-family: 'STIX Two Text';
        font-style: normal;
        font-weight: 400;
        font-display: block;
        src: url('${staticFile('fonts/stix-400.woff2')}') format('woff2');
      }

      @font-face {
        font-family: 'STIX Two Text';
        font-style: normal;
        font-weight: 500;
        font-display: block;
        src: url('${staticFile('fonts/stix-500.woff2')}') format('woff2');
      }

      @font-face {
        font-family: 'STIX Two Text';
        font-style: normal;
        font-weight: 600;
        font-display: block;
        src: url('${staticFile('fonts/stix-600.woff2')}') format('woff2');
      }

      @font-face {
        font-family: 'Inconsolata';
        font-style: normal;
        font-weight: 400;
        font-display: block;
        src: url('${staticFile('fonts/inconsolata-400.woff2')}') format('woff2');
      }

      @font-face {
        font-family: 'Libre Franklin';
        font-style: normal;
        font-weight: 400;
        font-display: block;
        src: url('${staticFile('fonts/franklin-400.woff2')}') format('woff2');
      }

      @font-face {
        font-family: 'Libre Franklin';
        font-style: normal;
        font-weight: 500;
        font-display: block;
        src: url('${staticFile('fonts/franklin-500.woff2')}') format('woff2');
      }

      * {
        box-sizing: border-box;
      }
    `}</style>
  );
};
