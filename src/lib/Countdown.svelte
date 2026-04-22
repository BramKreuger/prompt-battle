<script>
	import { onDestroy } from 'svelte';
	import { beep, finalBeep } from './audio.js';
	export let deadlineTs = null;
	export let size = 'md';
	export let playBeeps = false;

	let now = Date.now();
	/** @type {any} */
	let interval;
	let lastBeepedSec = -1;

	function tick() {
		now = Date.now();
	}

	$: {
		if (deadlineTs && !interval) interval = setInterval(tick, 100);
		if (!deadlineTs && interval) {
			clearInterval(interval);
			interval = null;
			lastBeepedSec = -1;
		}
	}

	onDestroy(() => interval && clearInterval(interval));

	$: remainingMs = deadlineTs ? Math.max(0, deadlineTs - now) : 0;
	$: totalSecs = Math.ceil(remainingMs / 1000);
	$: mm = Math.floor(totalSecs / 60);
	$: ss = totalSecs % 60;
	$: critical = deadlineTs && remainingMs <= 10_000 && remainingMs > 0;
	$: sizeClass = size === 'lg' ? 'text-6xl' : size === 'sm' ? 'text-xl' : 'text-3xl';

	$: if (playBeeps && deadlineTs && totalSecs !== lastBeepedSec) {
		if (totalSecs > 0 && totalSecs <= 10) {
			if (totalSecs === 1) finalBeep();
			else beep();
		}
		lastBeepedSec = totalSecs;
	}
</script>

{#if deadlineTs}
	<span class="font-mono tabular-nums {sizeClass} {critical ? 'text-red-400 animate-pulse' : 'text-turquoise'}">
		{mm}:{ss.toString().padStart(2, '0')}
	</span>
{/if}
