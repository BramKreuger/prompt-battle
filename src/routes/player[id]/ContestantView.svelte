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

	async function submit() {
		const attempt = prompt;
		failure = null;
		showImage = false;
		imageUrl = '';
		isGenerating = true;
		const abort = new AbortController();
		const timeout = setTimeout(() => abort.abort(), GENERATE_TIMEOUT_MS);
		try {
			const response = await fetch('/api/txt2img', {
				method: 'POST',
				body: JSON.stringify({ prompt: attempt }),
				headers: { 'content-type': 'application/json' },
				signal: abort.signal
			});
			const jsonData = await response.json().catch(() => ({}));
			if (!response.ok) {
				failWith(
					jsonData.code || 'error',
					jsonData.reason || jsonData.message || 'kon niet gegenereerd worden.',
					attempt
				);
				return;
			}
			isGenerating = false;
			showImage = true;
			imageUrl = jsonData.url;
			socket.emit('imageReady', { userId: $page.params.id, imageUrl });
		} catch (err) {
			if (/** @type {any} */ (err)?.name === 'AbortError') {
				failWith('timeout', 'duurde te lang om te genereren. Probeer het nog een keer!', attempt);
			} else {
				failWith('error', 'kon niet verstuurd worden. Probeer het nog een keer!', attempt);
			}
		} finally {
			clearTimeout(timeout);
		}
	}

	function initInput(el) {
		inputEl = el;
		el.focus();
	}

	$: if (canType && inputEl && document.activeElement !== inputEl) inputEl.focus();
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
		<div class="h-full flex items-center justify-center">
			<LoadingSpinnerWave size="200" color="#6EEBEA" unit="px" duration="1s" />
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
