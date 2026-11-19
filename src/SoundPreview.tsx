import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alphaGestureHandlers } from "./alphaGesture";
import { fixedExample } from "./explanation";
import { LabAudio } from "./labAudio";
import "./sound-preview.css";

// Plays every Lab sound through the Lab's own LabAudio, for listening and
// comparing sounds side by side. Excluded from production builds.
const trials = fixedExample.trials;
const byX = [...trials].sort((a, b) => a.x - b.x);

function SoundPreview() {
  const [audio] = useState(() => new LabAudio());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Bumped by every stop or manual edit, so a request still waiting for audio
  // to resume cannot start playing after it.
  const request = useRef(0);
  const [count, setCount] = useState(3);
  const [h, setH] = useState(0.55);
  const [prior, setPrior] = useState(4);
  const [status, setStatus] = useState("ボタンかスライダーを操作すると音が鳴ります。端末の音量を調整してください。");

  useEffect(() => {
    const stop = () => stopAll();
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("pagehide", stop);
      audio.dispose();
    };
  }, [audio]);

  async function ready() {
    const current = request.current;
    const enabled = await audio.enable();
    if (!enabled) setStatus("音を再生できません。もう一度試してください。");
    return enabled && current === request.current;
  }
  function cancelSequence() { request.current++; timers.current.forEach(clearTimeout); timers.current = []; }
  function stopAll() { cancelSequence(); audio.stop(); }
  async function sequence(steps: (() => void)[], interval: number) {
    cancelSequence();
    if (!await ready()) return;
    audio.stop();
    timers.current = steps.map((step, i) => setTimeout(step, i * interval));
  }
  // Manual edits take control back from a running sequence; the slider value
  // updates even if audio is unavailable.
  function manual<T>(set: (value: T) => void, value: T, play: () => void) {
    cancelSequence();
    set(value);
    void ready().then((enabled) => { if (enabled) play(); });
  }

  const stepSplit = (next: number, previous: number) => { setCount(next); audio.adjustSplit(next, previous); setStatus(`Split · good ${previous} → ${next}`); };
  const playBandwidth = (value: number) => { setH(value); audio.play("bandwidth", value); setStatus(`Bandwidth · h = ${value.toFixed(2)}`); };
  const playAlpha = (value: number) => { setPrior(value); audio.play("alpha", value); setStatus(`Prior · α = ${value.toFixed(2)}`); };
  const bounce = [...Array.from({ length: trials.length - 1 }, (_, i) => i + 1), ...Array.from({ length: trials.length - 2 }, (_, i) => trials.length - 2 - i)];

  return <main>
    <header><p>TPE LAB / DEVELOPMENT</p><h1>Sound audition</h1>
      <p>Labの音を、Labと同じ再生コードで鳴らします。どの音もハ長調にそろえています。</p>
    </header>

    <section aria-labelledby="split-heading">
      <h2 id="split-heading">Split / γ</h2>
      <p>good の数を1つ動かすたびに「カチ」。上げると少し高く、下げると少し低く、グリッドのタップで確定したときは中間の高さです。</p>
      <label>good の数 <output>{count}</output>
        <input aria-label="Good count" type="range" min="1" max={trials.length - 1} step="1" value={count}
          onChange={(event) => manual(setCount, Number(event.target.value), () => stepSplit(Number(event.target.value), count))} /></label>
      <div className="lab-sound-controls">
        <button onClick={() => void sequence([() => { audio.play("split", count); setStatus(`Split · good ${count} を確定`); }], 0)}>タップで確定</button>
        <button onClick={() => void sequence(bounce.map((k, i) => () => stepSplit(k, i === 0 ? count : bounce[i - 1])), 160)}>1 → {trials.length - 1} → 1 を往復</button>
      </div>
    </section>

    <section aria-labelledby="kernel-heading">
      <h2 id="kernel-heading">Kernel</h2>
      <p>観測点の x 座標で、ド・ミ・ソ・ド・ミ（C4〜E5）のどれかが「ぽこっ」と鳴ります。左ほど低く、右ほど高くなります。</p>
      <div className="kernel-pads">{byX.map((trial) => <button key={trial.id} onClick={() => void sequence([() => { audio.play("kernel", trial.x); setStatus(`Kernel · x = ${trial.x.toFixed(1)}`); }], 0)}>x = {trial.x.toFixed(1)}</button>)}</div>
      <div className="lab-sound-controls">
        <button onClick={() => void sequence(trials.map((trial) => () => audio.play("kernel", trial.x)), 380)}>観測順に置く</button>
      </div>
    </section>

    <section aria-labelledby="bandwidth-heading">
      <h2 id="bandwidth-heading">Bandwidth / h</h2>
      <p>木の音で、h が小さいほど高くなります（ハ長調のペンタトニック、C3〜C5）。</p>
      <label>Bandwidth h <output>{h.toFixed(2)}</output>
        <input aria-label="Bandwidth h" type="range" min="0.2" max="1.5" step="0.05" value={h}
          onChange={(event) => manual(setH, Number(event.target.value), () => playBandwidth(Number(event.target.value)))} /></label>
      <div className="lab-sound-controls">
        <button onClick={() => void sequence(Array.from({ length: 27 }, (_, i) => () => playBandwidth(Number((0.2 + i * 0.05).toFixed(2)))), 130)}>0.2 → 1.5 をスイープ</button>
      </div>
    </section>

    <section aria-labelledby="dice-heading">
      <h2 id="dice-heading">Roll the dice</h2>
      <p>候補をサンプリングするときの「カ・コン」（ド → ミ）です。</p>
      <div className="lab-sound-controls">
        <button onClick={() => void sequence([() => { audio.play("sample"); setStatus("Dice"); }], 0)}>振る</button>
        <button onClick={() => void sequence([-4.4, -2, 0.3].map((x) => () => audio.play("kernel", x)).concat([() => {}, () => audio.play("sample")]), 280)}>ドミソの後に振る</button>
      </div>
    </section>

    <section aria-labelledby="alpha-heading">
      <h2 id="alpha-heading">Prior / α</h2>
      <p>α = 0 では低いド（C3）だけが鳴り、α を上げるとソ3・ド4・ミ4・ソ4 が順に重なります。スライダーは押している間だけ鳴り、離すとふわっと消えます。</p>
      <label>Prior α <output>{prior.toFixed(2)}</output>
        <input {...alphaGestureHandlers(audio)} aria-label="Prior alpha" type="range" min="0" max="10" step="0.25" value={prior}
          onChange={(event) => manual(setPrior, Number(event.target.value), () => playAlpha(Number(event.target.value)))} /></label>
      <div className="lab-sound-controls">
        {[0, 5, 10].map((value) => <button key={value} onClick={() => void sequence([() => { setPrior(value); audio.auditionAlpha(value); setStatus(`Prior · α = ${value}`); }], 0)}>α = {value}</button>)}
        {/* Each step extends the same chord; it fades 450 ms after the last one. */}
        <button onClick={() => void sequence(Array.from({ length: 41 }, (_, i) => () => playAlpha(i / 4)), 80)}>0 → 10 をスイープ</button>
      </div>
    </section>

    <footer>
      <p role="status">{status}</p>
      <button onClick={() => { stopAll(); setStatus("停止しました。"); }}>すべて停止</button>
      <a href="./#lab">TPE Labを開く</a>
    </footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<SoundPreview />);
