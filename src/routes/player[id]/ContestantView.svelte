<script>
	import { onMount } from 'svelte';
	import Confetti from '../Confetti.svelte';
	import { page } from '$app/stores';
	import { Wave as LoadingSpinnerWave } from 'svelte-loading-spinners';
	import { tournamentState, getSocket } from '$lib/tournament-client.js';
	import Countdown from '$lib/Countdown.svelte';

	let prompt = '';
	let imageUrl = '';
	let showImage = false;
	let isGenerating = false;
	let isCelebrating = false;
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
	}

	async function submit() {
		try {
			showImage = false;
			imageUrl = '';
			isGenerating = true;
			const response = await fetch('/api/txt2img', {
				method: 'POST',
				body: JSON.stringify({ prompt }),
				headers: { 'content-type': 'application/json' }
			});
			if (!response.ok) {
				const jsonData = await response.json();
				throw Error(jsonData.message);
			}
			isGenerating = false;
			showImage = true;
			const jsonData = await response.json();
			imageUrl = jsonData.url;
			socket.emit('imageReady', { userId: $page.params.id, imageUrl });
		} catch (err) {
			alert(err);
			isGenerating = false;
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
