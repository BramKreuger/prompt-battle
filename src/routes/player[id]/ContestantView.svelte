<script>
	import { onMount } from 'svelte';
	import Confetti from '../Confetti.svelte';
	import { page } from '$app/stores';
	import { Wave as LoadingSpinnerWave } from 'svelte-loading-spinners';
	import { tournamentState, getSocket } from '$lib/tournament-client.js';
	import Countdown from '$lib/Countdown.svelte';

	// The image API can hang; without this the player screen would spin until
	// the server's generate deadline yanks the round away from them.
	const GENERATE_TIMEOUT_MS = 45_000;

	let prompt = '';
	let imageUrl = '';
	let showImage = false;
	let isGenerating = false;
	let isCelebrating = false;
	/** Last failed attempt: `{ code, reason, prompt }`, drives the retry screen. */
	/** @type {{ code: string, reason: string, prompt: string } | null} */
	let failure = null;
	/** Shown while the automatic second attempt is running. */
	let retrying = false;
	let restoredTyped = false;
	/** @type {any} */
	let socket;
	/** @type {any} */
	let inputEl;

	onMount(() => {
		socket = getSocket();

		socket.on('celebrate', (winnerId) => {
			if (String(winnerId) === $page.params.id) {
				isCelebrating = true;
				setTimeout(() => (isCelebrating = false), 4000);
			}
		});

		socket.on('generate', (winnerId) => {
			if (!winnerId || String(winnerId) === $page.params.id) {
				submit();
			}
		});

		socket.on('reset', (winnerId) => {
			if (!winnerId || String(winnerId) === $page.params.id) {
				reset();
			}
		});
	});

	$: socket && socket.emit('promptChange', { userId: $page.params.id, prompt });

	$: s = $tournamentState;
	$: match = s?.bracket?.[s.currentRoundIdx]?.[s.currentMatchIdx];
	$: myName = match ? (String($page.params.id) === '1' ? match.p1 : match.p2) : null;
	$: opponentName = match ? (String($page.params.id) === '1' ? match.p2 : match.p1) : null;
	$: currentText = s?.currentPrompt?.text;
	$: canType = s?.status === 'prompting';
	$: waiting = s?.status === 'match_intro' || s?.status === 'configured';

	function reset() {
		prompt = '';
		imageUrl = '';
		showImage = false;
		isGenerating = false;
		isCelebrating = false;
		failure = null;
		retrying = false;
	}

	/**
	 * Show the reason on this player's own screen and tell the server, so the
	 * stage and the host see why an image is missing. The round is NOT marked
	 * done — the player keeps the rest of the generate window to retry.
	 *
	 * @param {string} code
	 * @param {string} reason
	 * @param {string} attempt
	 */
	function failWith(code, reason, attempt) {
		failure = { code, reason, prompt: attempt };
		isGenerating = false;
		socket?.emit('imageFailed', { userId: $page.params.id, code, reason });
	}

	/**
	 * One call to the image API. Never throws; returns what happened.
	 *
	 * @param {string} attempt
	 */
	async function attemptGenerate(attempt) {
		const abort = new AbortController();
		const timeout = setTimeout(() => abort.abort(), GENERATE_TIMEOUT_MS);
		try {
			const response = await fetch('/api/txt2img', {
				method: 'POST',
				body: JSON.stringify({ prompt: attempt }),
				headers: { 'content-type': 'application/json' },
				signal: abort.signal
			});
			const data = await response.json().catch(() => ({}));
			if (response.ok) return { ok: true, url: data.url };
			return {
				ok: false,
				retryable: data.retryable !== false,
				code: data.code || 'error',
				reason: data.reason || data.message || 'kon niet gegenereerd worden.'
			};
		} catch (err) {
			const aborted = /** @type {any} */ (err)?.name === 'AbortError';
			return {
				ok: false,
				// A timeout is worth one more shot; a dead connection is not.
				retryable: aborted,
				code: aborted ? 'timeout' : 'error',
				reason: aborted
					? 'duurde te lang om te genereren. Probeer het nog een keer!'
					: 'kon niet verstuurd worden. Probeer het nog een keer!'
			};
		} finally {
			clearTimeout(timeout);
		}
	}

	/**
	 * Generate, retrying once automatically when the failure is the kind that
	 * a second attempt fixes.
	 *
	 * OpenAI's filter refuses innocent prompts: a playtest saw it reject "the
	 * physical form of deja vu, painted in bright colours" as sexual, and an
	 * identical prompt refused on 1 of 3 attempts. Making the player read a
	 * banner and press a button for that would waste the round's airtime, so
	 * the second attempt is silent. A prompt the pre-screen caught (a named
	 * character) is not retried — that answer will not change.
	 */
	async function submit() {
		const attempt = prompt;
		failure = null;
		retrying = false;
		showImage = false;
		imageUrl = '';
		isGenerating = true;

		for (let tryNo = 1; tryNo <= 2; tryNo++) {
			const result = await attemptGenerate(attempt);
			if (result.ok) {
				isGenerating = false;
				retrying = false;
				showImage = true;
				imageUrl = result.url;
				socket.emit('imageReady', { userId: $page.params.id, imageUrl });
				return;
			}
			if (result.retryable && tryNo === 1) {
				retrying = true;
				continue;
			}
			retrying = false;
			failWith(result.code, result.reason, attempt);
			return;
		}
	}

	function initInput(el) {
		inputEl = el;
		el.focus();
	}

	$: if (canType && inputEl && document.activeElement !== inputEl) inputEl.focus();

	// A player who reloads mid-round, or whose laptop went to sleep, would
	// otherwise come back to an empty box with the clock still running: the
	// text lives in this component, but the server has a copy of it.
	$: if (!restoredTyped && s?.status === 'prompting' && s.currentPrompt?.typed) {
		const mine = s.currentPrompt.typed[$page.params.id];
		if (mine && !prompt) prompt = mine;
		restoredTyped = true;
	}
</script>

<div class="h-full p-6">
	{#if !s || s.status === 'idle'}
		<div class="h-full flex items-center justify-center text-2xl text-gray-400">
			Waiting for tournament setup…
		</div>
	{:else if waiting}
		<div class="h-full flex flex-col items-center justify-center text-center">
			{#if myName}
				<div class="text-xl text-gray-400 mb-2">You are</div>
				<div class="text-6xl text-turquoise mb-6">{myName}</div>
				<div class="text-xl text-gray-400">Next opponent</div>
				<div class="text-4xl">{opponentName}</div>
				<div class="text-lg mt-8 text-gray-500">Get ready — waiting for prompt…</div>
			{:else}
				<div class="text-2xl text-gray-400">Waiting…</div>
			{/if}
		</div>
	{:else if failure && !isGenerating && s.status === 'generating'}
		<div class="h-full flex flex-col">
			<div class="border-2 border-red-500 bg-red-500/10 p-4 mb-3">
				<div class="text-sm text-red-300 uppercase tracking-widest">
					{failure.code === 'prompt_blocked' ? '🚫 Geblokkeerd' : '⚠️ Mislukt'}
				</div>
				<div class="text-2xl md:text-4xl mt-1">{failure.reason}</div>
				<div class="text-sm text-gray-400 mt-2 break-words">Je typte: "{failure.prompt}"</div>
			</div>
			<div class="flex items-center justify-between mb-2">
				<div class="text-sm text-gray-400 uppercase">Pas je prompt aan</div>
				{#if s.currentPrompt?.generateDeadlineTs}
					<div class="flex items-baseline gap-2">
						<span class="text-sm text-gray-400">Tijd om opnieuw te proberen</span>
						<Countdown deadlineTs={s.currentPrompt.generateDeadlineTs} size="md" />
					</div>
				{/if}
			</div>
			<div class="flex-1 p-4 border-2 border-turquoise min-h-0">
				<textarea
					class="w-full h-full bg-inherit text-turquoise text-2xl md:text-4xl"
					placeholder="Type een nieuwe prompt…"
					bind:value={prompt}
					use:initInput
				/>
			</div>
			<button
				class="mt-3 border-2 p-4 bg-turquoise text-black text-2xl"
				disabled={!prompt.trim()}
				on:click={() => submit()}
			>
				🎬 Opnieuw genereren
			</button>
		</div>
	{:else if s.status === 'generating' || isGenerating}
		<div class="h-full flex flex-col items-center justify-center gap-6">
			<LoadingSpinnerWave size="200" color="#6EEBEA" unit="px" duration="1s" />
			{#if retrying}
				<div class="text-xl text-yellow-300">
					Het filter weigerde je prompt — automatisch tweede poging…
				</div>
			{/if}
		</div>
	{:else if showImage && imageUrl}
		<div class="h-full flex flex-col">
			<div class="text-sm text-gray-400">
				{myName} · "{currentText}"
			</div>
			<img src={imageUrl} class="object-contain w-full flex-1 min-h-0 mt-2" alt="" />
		</div>
	{:else if canType}
		<div class="h-full flex flex-col">
			<div class="mb-3 flex items-start justify-between gap-4">
				<div>
					<div class="text-sm text-gray-400 uppercase">Your prompt challenge</div>
					<div class="text-3xl md:text-5xl">"{currentText}"</div>
					<div class="text-sm text-gray-500 mt-1">You are {myName}</div>
				</div>
				{#if s.currentPrompt?.deadlineTs}
					<Countdown deadlineTs={s.currentPrompt.deadlineTs} size="lg" />
				{/if}
			</div>
			<div class="flex-1 p-4 border-2 border-turquoise min-h-0">
				<textarea
					class="autofocus w-full h-full bg-inherit text-turquoise text-3xl md:text-5xl"
					placeholder="Type your prompt…"
					bind:value={prompt}
					use:initInput
				/>
			</div>
		</div>
	{:else}
		<div class="h-full flex items-center justify-center text-center">
			<div>
				<div class="text-2xl text-gray-400">Status: {s.status}</div>
				{#if myName}
					<div class="text-5xl text-turquoise mt-4">{myName}</div>
				{/if}
			</div>
		</div>
	{/if}

	{#if isCelebrating}
		<Confetti />
	{/if}

	<div
		class="w-full border-none left-0 bottom-0 absolute flex border-t-white border-2 text-sm px-4"
	>
		<div>Player {$page.params.id} — {myName || '—'}</div>
	</div>
</div>

<style>
	textarea {
		border: none;
		overflow: auto;
		outline: none;
		-webkit-box-shadow: none;
		-moz-box-shadow: none;
		box-shadow: none;
		resize: none;
	}
</style>
