// Ajoute la bande-son à la vidéo : out/axone-pub.mp4 + out/audio.wav -> out/axone-pub-son.mp4
// Usage : python make_audio.py   puis   node mux.mjs
import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';

execFileSync(ffmpegPath, [
  '-y', '-i', 'out/axone-pub.mp4', '-i', 'out/audio.wav',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart',
  'out/axone-pub-son.mp4',
], { stdio: 'inherit' });
console.log('Vidéo avec son : out/axone-pub-son.mp4');
