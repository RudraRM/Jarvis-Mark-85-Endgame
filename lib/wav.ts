/**
 * Browser-side audio conversion helpers.
 *
 * MediaRecorder gives us webm/opus (or mp4 on Safari), which the Parakeet NIM
 * endpoint will not always accept. Rather than shell out to ffmpeg on the
 * server, we decode the recording with the Web Audio API and re-encode it as a
 * 16-bit mono PCM WAV container at 16 kHz — exactly what parakeet-ctc-1.1b
 * expects.
 */

export const TARGET_SAMPLE_RATE = 16000;

/** Mix every channel down to mono. */
function toMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) return buffer.getChannelData(0).slice();

  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) mono[i] += data[i];
  }
  for (let i = 0; i < length; i += 1) mono[i] /= numberOfChannels;
  return mono;
}

/** Linear-interpolation resampler — good enough for speech, and dependency free. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to || from <= 0 || to <= 0) return input.slice();

  const ratio = from / to;
  const length = Math.round(input.length / ratio);
  const output = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }
  return output;
}

/** Wrap mono float samples in a 16-bit PCM RIFF/WAVE container. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([new Uint8Array(buffer)], { type: "audio/wav" });
}

/** Decode an arbitrary recorded blob into a 16 kHz mono 16-bit WAV blob. */
export async function toWav16kMono(recorded: Blob): Promise<Blob> {
  const arrayBuffer = await recorded.arrayBuffer();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioCtx) throw new Error("AudioContext not supported in this browser.");

  const context = new AudioCtx();

  try {
    const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
    const mono = toMono(decoded);
    const resampled = resample(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    return encodeWav(resampled, TARGET_SAMPLE_RATE);
  } finally {
    void context.close();
  }
}
