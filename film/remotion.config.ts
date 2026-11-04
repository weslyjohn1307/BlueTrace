import { Config } from '@remotion/cli/config';

// Master settings: frame-accurate render, H.264 high quality, broadly compatible pixel format.
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setCodec('h264');
Config.setCrf(16);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
