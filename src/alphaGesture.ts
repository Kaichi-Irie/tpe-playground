import type { InputHTMLAttributes } from "react";
import type { LabAudio } from "./labAudio";

const adjustmentKeys = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

// Capture keeps releases outside the slider from leaving a sustained voice on.
export function alphaGestureHandlers(audio: LabAudio): InputHTMLAttributes<HTMLInputElement> {
  return {
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      audio.beginAlphaGesture();
    },
    onPointerUp: () => audio.endAlphaGesture(),
    onPointerCancel: () => audio.endAlphaGesture(),
    onLostPointerCapture: () => audio.endAlphaGesture(),
    onBlur: () => audio.endAlphaGesture(),
    onKeyDown: (event) => { if (adjustmentKeys.has(event.key)) audio.beginAlphaGesture(); },
    onKeyUp: (event) => { if (adjustmentKeys.has(event.key)) audio.endAlphaGesture(); },
  };
}
