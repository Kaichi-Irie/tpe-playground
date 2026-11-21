// NumPy legacy RandomState uses MT19937 with scalar init_genrand seeding.
const stateSize = 624;

class Mt19937 {
  private readonly state = new Uint32Array(stateSize);
  private index = stateSize;

  constructor(seed: number) {
    this.state[0] = seed;
    for (let i = 1; i < stateSize; i++) {
      const previous = this.state[i - 1];
      this.state[i] = Math.imul(1812433253, previous ^ (previous >>> 30)) + i;
    }
  }

  private uint32(): number {
    if (this.index === stateSize) {
      for (let i = 0; i < stateSize; i++) {
        const bits = (this.state[i] & 0x80000000) | (this.state[(i + 1) % stateSize] & 0x7fffffff);
        this.state[i] = this.state[(i + 397) % stateSize] ^ (bits >>> 1) ^ ((bits & 1) ? 0x9908b0df : 0);
      }
      this.index = 0;
    }

    let bits = this.state[this.index++];
    bits ^= bits >>> 11;
    bits ^= (bits << 7) & 0x9d2c5680;
    bits ^= (bits << 15) & 0xefc60000;
    bits ^= bits >>> 18;
    return bits >>> 0;
  }

  randomSample(): number {
    const high = this.uint32() >>> 5;
    const low = this.uint32() >>> 6;
    return (high * 67108864 + low) / 9007199254740992;
  }
}

// Startup and TPE each index their own copy of this identical seeded sequence.
const streams = new Map<number, { generator: Mt19937; samples: number[] }>();
const cachedSeeds = 4;

export function validateRandomSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error("Invalid seed.");
}

export function randomSample(seed: number, position: number): number {
  let stream = streams.get(seed);
  if (!stream) {
    validateRandomSeed(seed);
    if (streams.size === cachedSeeds) streams.delete(streams.keys().next().value!);
    stream = { generator: new Mt19937(seed), samples: [] };
    streams.set(seed, stream);
  }
  while (stream.samples.length <= position) stream.samples.push(stream.generator.randomSample());
  return stream.samples[position];
}

// Equivalent to searchsorted(cdf, u, side="right"), including zero-weight kernels.
export function choiceIndex(cdf: readonly number[], u: number): number {
  let left = 0;
  let right = cdf.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (u < cdf[mid]) right = mid;
    else left = mid + 1;
  }
  return left;
}
