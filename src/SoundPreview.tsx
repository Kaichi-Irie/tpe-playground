import { alphaDesigns } from "./alphaSynth";
import { alphaGestureHandlers } from "./alphaGesture";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LabAudio } from "./labAudio";
import { soundDesigns } from "./labSoundDesign";
import { fixedExample, fractionForCount } from "./explanation";
import { splitTrials } from "./tpe";
import "./sound-preview.css";

function SoundPreview() {
  const [audio] = useState(() => new LabAudio());
  const [enabled, setEnabled] = useState(false);
  const [split, setSplit] = useState(0);
  const [alpha, setAlpha] = useState(0);
  const [count, setCount] = useState(3);
  const [prior, setPrior] = useState(4);
  const [status, setStatus] = useState("Choose a candidate to audition.");
  const threshold = splitTrials(fixedExample.trials, fractionForCount(count, 10)).threshold;
  function playAlpha(value: number) {
    setPrior(value);
    audio.play("alpha", value, alpha);
    setStatus(enabled ? `Playing ${alphaDesigns[alpha].name} · α = ${value.toFixed(2)}` : "Sound is off. Choose a candidate to enable it.");
  }
  useEffect(() => {
    const stop = () => audio.stop();
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", stop);
      window.removeEventListener("pagehide", stop);
      audio.dispose();
    };
  }, [audio]);
  async function preview(sound: "split" | "alpha", variant: number, value: number) {
    if (!await audio.enable()) { setStatus("Sound unavailable. Try again."); return; }
    setEnabled(true);
    audio.stop();
    if (sound === "alpha") audio.auditionAlpha(value, variant);
    else audio.play(sound, value, variant);
    setStatus(`Playing ${sound === "alpha" ? alphaDesigns[variant].name : soundDesigns.split[variant].name} · ${sound === "split" ? `γ = ${(count / 10).toFixed(1)}` : `α = ${value.toFixed(2)}`}`);
  }
  return <main>
    <header><p>TPE LAB / DEVELOPMENT</p><h1>Sound audition</h1><p>Adjust listening volume on your device. Candidate buttons enable sound. Alpha buttons play a 1.6-second preview; the slider sustains while held.</p></header>
    <div className="lab-sound-controls">
      <button role="switch" aria-label="Sound effects" aria-checked={enabled} onClick={async () => {
        if (enabled) { audio.disable(); setEnabled(false); setStatus("Muted."); }
        else { const ready = await audio.enable(); setEnabled(ready); setStatus(ready ? "Sound enabled." : "Sound unavailable. Try again."); }
      }}>Sound {enabled ? "ON" : "OFF"}</button>
    </div>
    <section aria-labelledby="split-heading">
      <h2 id="split-heading">Split / γ</h2>
      <p>Confirmed: Reference · Felt piano C3. The other piano studies remain available for reference.</p>
      <div className="candidates">{[0, 5, 6, 7].map((variant, index) => <button key={variant} aria-pressed={split === variant} onClick={() => { setSplit(variant); void preview("split", variant, threshold); }}>
        <strong>{index === 0 ? "Reference" : `S${index}`} · {soundDesigns.split[variant].name}</strong><span>{soundDesigns.split[variant].description}</span>
      </button>)}</div>
      <label>Good fraction γ <output>{(count / 10).toFixed(1)}</output><input aria-label="Audition gamma" type="range" min="1" max="9" step="1" value={count} onChange={(event) => {
        const next = Number(event.target.value); setCount(next);
        audio.adjustSplit(splitTrials(fixedExample.trials, fractionForCount(next, 10)).threshold, split);
        setStatus(enabled ? `Playing ${soundDesigns.split[split].name} · γ = ${(next / 10).toFixed(1)}` : "Sound is off. Choose a candidate to enable it.");
      }} /></label>
      <p>Split height: {threshold.toFixed(2)} · Same rank mapping as the Lab.</p>
    </section>
    <section aria-labelledby="alpha-heading">
      <h2 id="alpha-heading">Prior / α</h2>
      <p>Confirmed: B1 · Velvet. Hold and move the slider: one continuous voice changes smoothly, then fades when you release. Pitch stays fixed within each sound; Breath is unpitched.</p>
      <div className="alpha-audition-control">
        <strong>B{alpha + 1} · {alphaDesigns[alpha].name}</strong>
      <label>Prior α <output>{prior.toFixed(2)}</output><input {...alphaGestureHandlers(audio)} aria-label="Audition alpha" type="range" min="0" max="10" step="0.25" value={prior} onChange={(event) => playAlpha(Number(event.target.value))} /></label>
      <div className="lab-sound-controls" aria-label="Alpha comparison values">{[0, 5, 10].map((value) => <button key={value} onClick={() => playAlpha(value)}>α = {value}</button>)}</div>
      </div>
      <div className="candidates">{alphaDesigns.map((design, variant) => <button key={design.name} aria-pressed={alpha === variant} onClick={() => { setAlpha(variant); void preview("alpha", variant, prior); }}><strong>B{variant + 1} · {design.name}</strong><span className="sound-family">{design.family}</span><span>{design.description}</span></button>)}</div>
    </section>
    <footer><p role="status">{status}</p><button onClick={() => { audio.stop(); setStatus("Stopped."); }}>Stop sound</button><p>Audition: {split === 0 ? "Reference" : `S${[0, 5, 6, 7].indexOf(split)}`} / B{alpha + 1}. Confirmed for the Lab: Reference · Felt piano C3 / B1 · Velvet. Other candidates are for comparison.</p><a href="./#lab">Open TPE Lab</a></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<SoundPreview />);
