import { writable } from 'svelte/store';

/** @type {AudioContext | null} */
let ctx = null;
export const audioEnabled = writable(false);

export function enableAudio() {
	if (typeof window === 'undefined') return;
	if (!ctx) {
		const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
		if (!AC) return;
		ctx = new AC();
	}
	if (ctx.state === 'suspended') ctx.resume();
	audioEnabled.set(true);
}

export function beep({ freq = 880, duration = 0.12, volume = 0.35 } = {}) {
	if (!ctx || ctx.state !== 'running') return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'sine';
	osc.frequency.value = freq;
	gain.gain.value = volume;
	osc.connect(gain).connect(ctx.destination);
	const t0 = ctx.currentTime;
	gain.gain.setValueAtTime(volume, t0);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
	osc.start(t0);
	osc.stop(t0 + duration);
}

export function finalBeep() {
	beep({ freq: 1320, duration: 0.35, volume: 0.45 });
}
