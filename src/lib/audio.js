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
	// Unlock the music element on the same gesture — browsers only allow
	// playback to start from a real user interaction, and the stage screen has
	// exactly one (the "Enable sounds" button).
	primeMusic();
	audioEnabled.set(true);
}

/* -------------------------------------------------------------------------- */
/* Looping background music (the tense game-show bed)                         */
/* -------------------------------------------------------------------------- */

const MUSIC_SRC = '/tense-music.mp3';
const MUSIC_VOLUME = 0.55;

/** @type {HTMLAudioElement | null} */
let musicEl = null;
/** @type {any} */
let fadeHandle = null;

function getMusic() {
	if (typeof Audio === 'undefined') return null;
	if (!musicEl) {
		musicEl = new Audio(MUSIC_SRC);
		musicEl.loop = true;
		musicEl.preload = 'auto';
		musicEl.volume = 0;
	}
	return musicEl;
}

/** Start and immediately stop it, so later programmatic play() is allowed. */
function primeMusic() {
	const el = getMusic();
	if (!el) return;
	el.volume = 0;
	const started = el.play();
	if (started && typeof started.then === 'function') {
		started
			.then(() => {
				el.pause();
				el.currentTime = 0;
			})
			.catch(() => {});
	}
}

/**
 * @param {HTMLAudioElement} el
 * @param {number} target
 * @param {number} seconds
 * @param {() => void} [onDone]
 */
function fadeTo(el, target, seconds, onDone) {
	if (fadeHandle) clearInterval(fadeHandle);
	const steps = Math.max(1, Math.round(seconds * 20));
	const from = el.volume;
	let step = 0;
	fadeHandle = setInterval(() => {
		step += 1;
		const v = from + (target - from) * (step / steps);
		el.volume = Math.min(1, Math.max(0, v));
		if (step >= steps) {
			clearInterval(fadeHandle);
			fadeHandle = null;
			if (onDone) onDone();
		}
	}, 50);
}

export function startTenseMusic({ fade = 0.8 } = {}) {
	const el = getMusic();
	if (!el) return;
	const started = el.play();
	if (started && typeof started.then === 'function') started.catch(() => {});
	fadeTo(el, MUSIC_VOLUME, fade);
}

export function stopTenseMusic({ fade = 0.5 } = {}) {
	const el = musicEl;
	if (!el || el.paused) return;
	fadeTo(el, 0, fade, () => {
		el.pause();
		el.currentTime = 0;
	});
}

/* -------------------------------------------------------------------------- */
/* Synthesised stings — no assets needed, so they can never fail to load      */
/* -------------------------------------------------------------------------- */

/**
 * One shaped oscillator note. `to` sweeps the pitch, which is what turns a
 * plain beep into a riser or a fall.
 */
function tone({ freq = 440, to = 0, type = 'sine', duration = 0.2, volume = 0.3, delay = 0 }) {
	if (!ctx || ctx.state !== 'running') return;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = /** @type {OscillatorType} */ (type);
	const t0 = ctx.currentTime + delay;
	osc.frequency.setValueAtTime(freq, t0);
	if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + duration);
	gain.gain.setValueAtTime(0.0001, t0);
	gain.gain.exponentialRampToValueAtTime(volume, t0 + Math.min(0.04, duration / 3));
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t0);
	osc.stop(t0 + duration + 0.05);
}

/** Filtered white noise — the cymbal/riser half of a sting. */
function noiseSwell({ duration = 0.9, volume = 0.22, from = 400, to = 6000, delay = 0 }) {
	if (!ctx || ctx.state !== 'running') return;
	const frames = Math.floor(ctx.sampleRate * duration);
	const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
	const data = buffer.getChannelData(0);
	for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
	const src = ctx.createBufferSource();
	src.buffer = buffer;
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.Q.value = 1.2;
	const gain = ctx.createGain();
	const t0 = ctx.currentTime + delay;
	filter.frequency.setValueAtTime(from, t0);
	filter.frequency.exponentialRampToValueAtTime(to, t0 + duration);
	gain.gain.setValueAtTime(0.0001, t0);
	gain.gain.exponentialRampToValueAtTime(volume, t0 + duration * 0.75);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
	src.connect(filter).connect(gain).connect(ctx.destination);
	src.start(t0);
	src.stop(t0 + duration);
}

export function beep({ freq = 880, duration = 0.12, volume = 0.35 } = {}) {
	tone({ freq, duration, volume });
}

export function finalBeep() {
	tone({ freq: 1320, duration: 0.35, volume: 0.45 });
}

/** New prompt on screen: two quick blips, so the room looks up. */
export function promptSting() {
	tone({ freq: 660, duration: 0.09, volume: 0.3, type: 'triangle' });
	tone({ freq: 990, duration: 0.14, volume: 0.3, type: 'triangle', delay: 0.1 });
}

/**
 * The images are revealed and voting opens: a riser that lands on a chord.
 * Deliberately ends in silence — the audience needs room to react and vote.
 */
export function revealSting() {
	noiseSwell({ duration: 0.7, volume: 0.2, from: 300, to: 7000 });
	tone({ freq: 523, duration: 0.7, volume: 0.28, type: 'triangle', delay: 0.62 });
	tone({ freq: 659, duration: 0.7, volume: 0.24, type: 'triangle', delay: 0.64 });
	tone({ freq: 784, duration: 0.8, volume: 0.22, type: 'triangle', delay: 0.66 });
}

/** A prompt winner is revealed — short, lands with the confetti. */
export function winnerFanfare() {
	const notes = [523, 659, 784, 1047];
	notes.forEach((freq, i) =>
		tone({ freq, duration: 0.22, volume: 0.3, type: 'square', delay: i * 0.11 })
	);
}

/** A match is decided: same idea, one octave of triumph bigger. */
export function matchFanfare() {
	const notes = [392, 523, 659, 784, 1047];
	notes.forEach((freq, i) =>
		tone({ freq, duration: 0.28, volume: 0.3, type: 'square', delay: i * 0.13 })
	);
	tone({ freq: 1568, duration: 0.9, volume: 0.26, type: 'triangle', delay: 0.7 });
}

/** Champion of the whole tournament. */
export function championFanfare() {
	const notes = [523, 659, 784, 1047, 784, 1047, 1319];
	notes.forEach((freq, i) =>
		tone({ freq, duration: 0.3, volume: 0.32, type: 'square', delay: i * 0.15 })
	);
	noiseSwell({ duration: 1.4, volume: 0.18, from: 500, to: 9000, delay: 0.9 });
	tone({ freq: 2093, duration: 1.4, volume: 0.24, type: 'triangle', delay: 1.05 });
}
