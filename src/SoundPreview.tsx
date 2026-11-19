import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { alphaGestureHandlers } from "./alphaGesture";
import { fixedExample } from "./explanation";
import { diceSounds } from "./diceSounds";
import { LabAudio } from "./labAudio";
import { adoptedVoices, alphaStudies, bandwidthStudies, alphaVoiceLevels, alphaVoicing, kernelStudies, kernelStudyNote, noteName, splitStudies, splitStudyNote } from "./labVoices";
import "./sound-preview.css";

const observationCount = fixedExample.trials.length;
const diceIndexes = [6, 9, 10, 11];
const diceItems = diceIndexes.map((index, i) => ({ id: `D${i}`, name: diceSounds[index].name, description: i === 0 ? "A3 → C♯4 · 以前の音（比較用）" : diceSounds[index].hint }));
const byX = [...fixedExample.trials].sort((a, b) => a.x - b.x);

function Candidates({ items, adopted, selected, onSelect }: { items: readonly { id: string; name: string; description: string }[]; adopted: number; selected: number; onSelect: (index: number) => void }) {
  return <div className="candidates">
    {items.map((item, index) => <button key={item.id} aria-pressed={selected === index} onClick={() => onSelect(index)}>
      <strong>{item.id} · {item.name}{index === adopted ? " · 採用" : ""}</strong><span>{item.description}</span>
    </button>)}
  </div>;
}

function SoundPreview() {
  const [audio] = useState(() => new LabAudio());
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [split, setSplit] = useState<number>(adoptedVoices.split);
  const [kernel, setKernel] = useState<number>(adoptedVoices.kernel);
  const [alpha, setAlpha] = useState<number>(adoptedVoices.alpha);
  const [bandwidth, setBandwidth] = useState<number>(1);
  const [h, setH] = useState(0.55);
  const [dice, setDice] = useState(diceIndexes.indexOf(adoptedVoices.sample));
  const [count, setCount] = useState(3);
  const [prior, setPrior] = useState(4);
  const [status, setStatus] = useState("候補を選ぶと音が鳴ります。端末の音量を調整してください。");

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
    const enabled = await audio.enable();
    if (!enabled) setStatus("音を再生できません。もう一度試してください。");
    return enabled;
  }
  function clearSequence() { timers.current.forEach(clearTimeout); timers.current = []; }
  function stopAll() { clearSequence(); audio.stop(); }
  function sequence(steps: (() => void)[], interval: number) {
    clearSequence();
    timers.current = steps.map((step, i) => setTimeout(step, i * interval));
  }

  // Split / γ
  function playSplit(k: number, variant = split, slider = true) {
    if (slider) audio.adjustSplit(k, variant); else audio.play("split", k, variant);
    setStatus(`Split · ${splitStudies[variant].name} · k = ${k}${splitStudies[variant].legato ? ` · ${noteName(splitStudyNote(k))}` : ""}`);
  }
  async function chooseSplit(variant: number) {
    setSplit(variant);
    if (!await ready()) return;
    stopAll(); playSplit(count, variant, false);
  }
  async function splitScale() {
    if (!await ready()) return;
    stopAll();
    sequence(Array.from({ length: observationCount - 1 }, (_, i) => () => { setCount(i + 1); playSplit(i + 1); }), 320);
  }
  async function splitBounce() {
    if (!await ready()) return;
    stopAll();
    const path = [...Array.from({ length: observationCount - 1 }, (_, i) => i + 1), ...Array.from({ length: observationCount - 2 }, (_, i) => observationCount - 2 - i)];
    sequence(path.map((k) => () => { setCount(k); playSplit(k); }), 160);
  }
  async function splitConfirm() {
    if (!await ready()) return;
    stopAll(); playSplit(count, split, false);
  }

  // Kernel
  function playKernel(x: number, variant = kernel) {
    audio.play("kernel", x, variant);
    setStatus(`Kernel · ${kernelStudies[variant].name} · x = ${x.toFixed(1)} · ${noteName(kernelStudyNote(x))}`);
  }
  async function chooseKernel(variant: number) {
    setKernel(variant);
    if (!await ready()) return;
    stopAll(); playKernel(fixedExample.trials[0].x, variant);
  }
  async function kernelSequence(interval: number) {
    if (!await ready()) return;
    stopAll();
    sequence(fixedExample.trials.map((trial) => () => playKernel(trial.x)), interval);
  }

  // Bandwidth h
  function playBandwidth(value: number, variant = bandwidth) {
    setH(value);
    audio.play("bandwidth", value, variant);
    setStatus(`Bandwidth · ${bandwidthStudies[variant].name} · h = ${value.toFixed(2)}`);
  }
  async function chooseBandwidth(variant: number) {
    setBandwidth(variant);
    if (!await ready()) return;
    stopAll(); playBandwidth(h, variant);
  }
  async function bandwidthPoint(value: number) {
    if (!await ready()) return;
    stopAll(); playBandwidth(value);
  }
  async function bandwidthSweep(from: number, to: number) {
    if (!await ready()) return;
    stopAll();
    const steps = Math.round(Math.abs(to - from) / 0.05);
    sequence(Array.from({ length: steps + 1 }, (_, i) => () => playBandwidth(Number((from + Math.sign(to - from) * i * 0.05).toFixed(2)))), 70);
  }

  // Dice (candidate sampling)
  function playDice(choice = dice) {
    audio.play("sample", undefined, diceIndexes[choice]);
    setStatus(`Dice · ${diceItems[choice].name}`);
  }
  async function chooseDice(choice: number) {
    setDice(choice);
    if (!await ready()) return;
    stopAll(); playDice(choice);
  }
  async function diceAfterTriad() {
    if (!await ready()) return;
    stopAll();
    const kernel = adoptedVoices.kernel;
    sequence([-4.4, 0.3, 4.2].map((x) => () => audio.play("kernel", x, kernel)).concat([() => {}, () => playDice()]), 280);
  }
  async function diceRepeat() {
    if (!await ready()) return;
    stopAll();
    sequence(Array.from({ length: 4 }, () => () => playDice()), 450);
  }

  // Prior α
  function playAlpha(value: number, audition = false, variant = alpha) {
    setPrior(value);
    if (audition) audio.auditionAlpha(value, variant); else audio.play("alpha", value, variant);
    const voices = alphaVoiceLevels(value).filter((level) => level >= 0.5).length;
    setStatus(`Prior · ${alphaStudies[variant].name} · α = ${value.toFixed(2)} · ${voices}音`);
  }
  async function chooseAlpha(variant: number) {
    setAlpha(variant);
    if (!await ready()) return;
    stopAll(); playAlpha(prior, true, variant);
  }
  async function alphaPoint(value: number) {
    if (!await ready()) return;
    stopAll(); playAlpha(value, true);
  }
  async function alphaSweep() {
    if (!await ready()) return;
    stopAll();
    sequence(Array.from({ length: 41 }, (_, i) => () => playAlpha(i / 4, i === 40)), 80);
  }

  return <main>
    <header><p>TPE LAB / DEVELOPMENT</p><h1>Sound audition</h1>
      <p>Labのサウンドの試聴ページです。全部の音をハ長調にそろえ、倍音は整数倍だけにしています。「採用」がLabで鳴る音で、ほかは比較用の候補です。</p>
    </header>

    <section aria-labelledby="split-heading">
      <h2 id="split-heading">Split / γ — 仕切りの手応え</h2>
      <p>γ スライダーで good の数 k（1〜{observationCount - 1}）を1つ動かすたび、またはグリッドをタップして split を確定したときの音です。S1〜S3 は前回のドレミ音階で比較用です。S4〜S9 はクリック系で、S5・S8 は上げたか下げたかで音が変わります（タップでの確定は中立の音）。</p>
      <Candidates items={splitStudies} adopted={adoptedVoices.split} selected={split} onSelect={(i) => void chooseSplit(i)} />
      <div className="audition-control">
        <label>good の数 k <output>{count}{splitStudies[split].legato ? ` · ${noteName(splitStudyNote(count))}` : ""}</output>
          <input aria-label="Good count" type="range" min="1" max={observationCount - 1} step="1" value={count} onChange={async (event) => {
            const next = Number(event.target.value); setCount(next);
            if (await ready()) playSplit(next);
          }} /></label>
        <div className="lab-sound-controls">
          <button onClick={() => void splitScale()}>k = 1 → {observationCount - 1} をゆっくり</button>
          <button onClick={() => void splitBounce()}>速く往復（1 → {observationCount - 1} → 1）</button>
          <button onClick={() => void splitConfirm()}>タップで確定</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="kernel-heading">
      <h2 id="kernel-heading">Kernel — ドミソ</h2>
      <p>観測点の x 座標で、ド・ミ・ソ・ド・ミ（C4〜E5）のどれかが鳴ります。左ほど低く、右ほど高くなります。どの順に置いても和音の構成音だけが鳴ります。</p>
      <Candidates items={kernelStudies} adopted={adoptedVoices.kernel} selected={kernel} onSelect={(i) => void chooseKernel(i)} />
      <div className="audition-control">
        <div className="kernel-pads">{byX.map((trial) => <button key={trial.id} onClick={async () => { if (await ready()) playKernel(trial.x); }}>
          x = {trial.x.toFixed(1)}<span>{noteName(kernelStudyNote(trial.x))}</span>
        </button>)}</div>
        <div className="lab-sound-controls">
          <button onClick={() => void kernelSequence(380)}>観測順に置く（ゆっくり）</button>
          <button onClick={() => void kernelSequence(140)}>連続タップ（速く）</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="bandwidth-heading">
      <h2 id="bandwidth-heading">Bandwidth / h — 幅と波長</h2>
      <p>h（0.2〜1.5、0.05刻み）を動かしたときの音です。カーネルの幅を波長に見立てて、狭いほど高く・短く・明るく、広いほど低く・長く・こもるようにしています。B0は採用した音、B1〜B4は高低感を抑えた案、B5〜B10は高低感をはっきり出す案です。B4・B9・B10はスライダーを押している間だけ鳴ります。</p>
      <Candidates items={bandwidthStudies} adopted={adoptedVoices.bandwidth} selected={bandwidth} onSelect={(i) => void chooseBandwidth(i)} />
      <div className="audition-control">
        <label>Bandwidth h <output>{h.toFixed(2)}</output>
          <input {...alphaGestureHandlers(audio)} aria-label="Bandwidth h" type="range" min="0.2" max="1.5" step="0.05" value={h} onChange={async (event) => {
            const value = Number(event.target.value);
            if (await ready()) playBandwidth(value);
          }} /></label>
        <div className="lab-sound-controls">
          {[0.2, 0.55, 1, 1.5].map((value) => <button key={value} onClick={() => void bandwidthPoint(value)}>h = {value}</button>)}
          <button onClick={() => void bandwidthSweep(0.2, 1.5)}>0.2 → 1.5 をスイープ</button>
          <button onClick={() => void bandwidthSweep(1.5, 0.2)}>1.5 → 0.2</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="dice-heading">
      <h2 id="dice-heading">Roll the dice — 調をそろえる</h2>
      <p>候補をサンプリングするときの「カ・コン」です。音色とリズムは Claves · low のままで、音程だけをハ長調に移しています。D0 は以前の音（2音目の C♯ がハ長調の外）です。「ドミソの後に振る」で、ほかの音が作るハ長調の流れの中で聞き比べられます。</p>
      <Candidates items={diceItems} adopted={diceIndexes.indexOf(adoptedVoices.sample)} selected={dice} onSelect={(i) => void chooseDice(i)} />
      <div className="audition-control">
        <div className="lab-sound-controls">
          <button onClick={async () => { if (await ready()) playDice(); }}>振る</button>
          <button onClick={() => void diceAfterTriad()}>ドミソの後に振る</button>
          <button onClick={() => void diceRepeat()}>4回続けて振る</button>
        </div>
      </div>
    </section>

    <section aria-labelledby="alpha-heading">
      <h2 id="alpha-heading">Prior / α — 積み上がる和音</h2>
      <p>α = 0 では低いド（C3）だけが鳴ります。α を上げると、ソ3 → ド4 → ミ4 → ソ4 が順に重なり、α = 10 で5音の和音になります。スライダーは押している間だけ鳴り、離すとふわっと消えます。</p>
      <Candidates items={alphaStudies} adopted={adoptedVoices.alpha} selected={alpha} onSelect={(i) => void chooseAlpha(i)} />
      <div className="audition-control">
        <label>Prior α <output>{prior.toFixed(2)} · {alphaVoicing.filter((_, i) => alphaVoiceLevels(prior)[i] >= 0.5).map(noteName).join(" + ")}</output>
          <input {...alphaGestureHandlers(audio)} aria-label="Prior alpha" type="range" min="0" max="10" step="0.25" value={prior} onChange={async (event) => {
            const value = Number(event.target.value);
            if (await ready()) playAlpha(value);
          }} /></label>
        <div className="lab-sound-controls">
          {[0, 2.5, 5, 7.5, 10].map((value) => <button key={value} onClick={() => void alphaPoint(value)}>α = {value}</button>)}
          <button onClick={() => void alphaSweep()}>0 → 10 をスイープ</button>
        </div>
      </div>
    </section>

    <footer>
      <p role="status">{status}</p>
      <button onClick={() => { stopAll(); setStatus("停止しました。"); }}>すべて停止</button>
      <p>選択中: Split {splitStudies[split].id} / Kernel {kernelStudies[kernel].id} / Bandwidth {bandwidthStudies[bandwidth].id} / Dice {diceItems[dice].id} / Prior {alphaStudies[alpha].id}。Labでは {splitStudies[adoptedVoices.split].id} / {kernelStudies[adoptedVoices.kernel].id} / {bandwidthStudies[adoptedVoices.bandwidth].id} / {alphaStudies[adoptedVoices.alpha].id} が鳴ります。</p>
      <a href="./#lab">TPE Labを開く</a>
    </footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<SoundPreview />);
