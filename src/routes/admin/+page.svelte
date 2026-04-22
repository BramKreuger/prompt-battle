<script>
	import { onMount } from 'svelte';
	import { io } from 'socket.io-client';
	import { tournamentState, sendAction, getSocket } from '$lib/tournament-client.js';
	import Countdown from '$lib/Countdown.svelte';

	let customPromptText = '';
	let customPromptTier = 'medium';
	let manualPromptEdit = '';
	let editing = false;
	let aiBusy = false;
	let aiError = '';
	let aiCount = 5;
	let aiTier = 'medium';
	/** @type {any} */
	let legacySocket;

	onMount(() => {
		getSocket();
		legacySocket = io();
	});

	$: s = $tournamentState;
	$: cfg = s?.config;
	$: match = cfg && s.bracket?.[s.currentRoundIdx]?.[s.currentMatchIdx];
	$: cp = s?.currentPrompt;
	$: roundLabel = roundName(s);

	function roundName(state) {
		if (!state?.config) return '';
		const total = Math.log2(state.config.size);
		const fromFinal = total - 1 - state.currentRoundIdx;
		if (fromFinal === 0) return 'Final';
		if (fromFinal === 1) return 'Semifinal';
		if (fromFinal === 2) return 'Quarterfinal';
		return `Round ${state.currentRoundIdx + 1}`;
	}

	function triggerGenerate() {
		legacySocket?.emit('generate', {});
	}
	function triggerReset() {
		legacySocket?.emit('reset', {});
	}
	function triggerCelebrate(playerId) {
		legacySocket?.emit('celebrate', { userId: playerId });
	}

	function saveManualPrompt() {
		sendAction('setPromptText', { text: manualPromptEdit });
		editing = false;
	}
	function startEditing() {
		manualPromptEdit = cp?.text || '';
		editing = true;
	}
	function regenerate() {
		sendAction('regeneratePrompt');
	}
	function addCustom() {
		if (!customPromptText.trim()) return;
		sendAction('addCustomPrompt', { text: customPromptText.trim(), tier: customPromptTier });
		customPromptText = '';
	}

	async function generateAiPrompts() {
		aiError = '';
		aiBusy = true;
		try {
			const res = await fetch('/api/ai-prompts', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ count: aiCount, tier: aiTier })
			});
			if (!res.ok) throw new Error((await res.json()).message || 'Failed');
			const { prompts } = await res.json();
			for (const p of prompts) sendAction('addCustomPrompt', { text: p, tier: aiTier });
		} catch (e) {
			aiError = e.message || String(e);
		} finally {
			aiBusy = false;
		}
	}
</script>

<svelte:head><title>Tournament Admin</title></svelte:head>

<div class="p-4 text-white overflow-auto h-full">
	{#if !s || s.status === 'idle'}
		<div class="text-center p-8">
			<p class="text-2xl mb-4">No tournament is configured.</p>
			<a class="border-2 p-3 px-6 inline-block" href="/setup">Go to Setup →</a>
		</div>
	{:else}
		<div class="flex gap-6">
			<!-- Left: current match controller -->
			<div class="flex-1 min-w-0">
				<div class="flex items-baseline gap-4 mb-2">
					<h1 class="text-2xl">{roundLabel}</h1>
					<span class="text-sm text-gray-400">
						Match {s.currentMatchIdx + 1} / {s.bracket[s.currentRoundIdx]?.length} &nbsp;·&nbsp;
						status: <code>{s.status}</code>
					</span>
				</div>

				{#if s.status === 'configured'}
					<div class="border p-4">
						<p class="mb-2">Bracket is ready. {cfg.size} players, best of {cfg.promptsPerMatch}.</p>
						<button class="border-2 p-3 px-6 bg-turquoise text-black" on:click={() => sendAction('startTournament')}>
							Start Tournament →
						</button>
					</div>
				{:else if match}
					<div class="border p-4 mb-4">
						<div class="flex justify-between items-center text-xl mb-2">
							<div>
								<span class="font-bold">{match.p1 || '—'}</span>
								<span class="text-turquoise">{match.scores[1]}</span>
								&nbsp;vs&nbsp;
								<span class="text-turquoise">{match.scores[2]}</span>
								<span class="font-bold">{match.p2 || '—'}</span>
							</div>
						</div>

						{#if s.status === 'match_intro'}
							<p class="text-sm text-gray-400 mb-2">
								Ready for match. Players' screens will become active.
							</p>
							<button class="border-2 p-3 px-6 bg-turquoise text-black" on:click={() => sendAction('startPrompt')}>
								Reveal first prompt →
							</button>
						{:else if s.status === 'prompting'}
							<div class="mb-2">
								<div class="flex items-center justify-between">
									<div class="text-sm text-gray-400">Current prompt ({cp.difficulty}):</div>
									{#if cp.deadlineTs}
										<Countdown deadlineTs={cp.deadlineTs} size="md" />
									{/if}
								</div>
								{#if editing}
									<div class="flex gap-2 mt-1">
										<input class="flex-1 bg-black border border-white/40 p-2" bind:value={manualPromptEdit} />
										<button class="border p-2" on:click={saveManualPrompt}>Save</button>
										<button class="border p-2" on:click={() => (editing = false)}>Cancel</button>
									</div>
								{:else}
									<div class="text-2xl mt-1">"{cp.text}"</div>
									<div class="flex gap-2 mt-2">
										<button class="border p-2" on:click={startEditing}>Edit</button>
										<button class="border p-2" on:click={regenerate}>🎲 Regenerate</button>
									</div>
								{/if}
							</div>
							<div class="grid grid-cols-2 gap-2 text-sm mt-3">
								<div class="border p-2">
									<div class="text-gray-400">P1 typing:</div>
									<div class="min-h-[2rem]">{cp.typed[1] || '—'}</div>
								</div>
								<div class="border p-2">
									<div class="text-gray-400">P2 typing:</div>
									<div class="min-h-[2rem]">{cp.typed[2] || '—'}</div>
								</div>
							</div>
							<button class="mt-3 border-2 p-3 px-6 bg-turquoise text-black" on:click={triggerGenerate}>
								🎬 Generate both images
							</button>
						{:else if s.status === 'generating'}
							<p>Generating images…</p>
							<div class="grid grid-cols-2 gap-2 text-sm mt-2">
								<div class="border p-2">P1: {cp.imageReady[1] ? '✅ ready' : '…'}</div>
								<div class="border p-2">P2: {cp.imageReady[2] ? '✅ ready' : '…'}</div>
							</div>
						{:else if s.status === 'voting'}
							<p class="mb-2">Voting open. Audience votes at <code>/vote</code>.</p>
							<div class="grid grid-cols-2 gap-2 text-lg">
								<div class="border p-2">{match.p1}: {cp.votes[1]}</div>
								<div class="border p-2">{match.p2}: {cp.votes[2]}</div>
							</div>
							<button class="mt-3 border-2 p-3 px-6 bg-turquoise text-black" on:click={() => sendAction('revealPromptWinner')}>
								Close voting & reveal winner →
							</button>
						{:else if s.status === 'revealing'}
							<p class="text-2xl mb-3">
								🏆 Winner of this prompt:
								<span class="text-turquoise">{cp.winner === 1 ? match.p1 : match.p2}</span>
							</p>
							<button
								class="border p-2 mr-2"
								on:click={() => triggerCelebrate(cp.winner)}
								>🎉 Confetti on player {cp.winner}</button
							>
							<button class="border-2 p-3 px-6 bg-turquoise text-black" on:click={() => { triggerReset(); sendAction('nextPromptOrMatch'); }}>
								Continue →
							</button>
						{:else if s.status === 'match_complete'}
							<p class="text-2xl mb-3">
								🏆 Match winner: <span class="text-turquoise">{match.winner === 1 ? match.p1 : match.p2}</span>
							</p>
							<button class="border-2 p-3 px-6 bg-turquoise text-black" on:click={() => { triggerReset(); sendAction('nextMatch'); }}>
								Next match →
							</button>
						{/if}
					</div>
				{/if}

				{#if s.status === 'tournament_complete'}
					<div class="border-2 border-turquoise p-8 text-center">
						<h2 class="text-4xl mb-2">🏆 Champion</h2>
						<p class="text-5xl text-turquoise">{s.champion}</p>
						<button class="mt-6 border p-3 px-6" on:click={() => sendAction('resetTournament')}>
							Reset tournament
						</button>
					</div>
				{/if}
			</div>

			<!-- Right: bracket + prompt pool -->
			<div class="w-80">
				<h2 class="text-xl mb-2">Bracket</h2>
				<div class="space-y-4 mb-6 text-sm">
					{#each s.bracket as round, rIdx}
						<div>
							<div class="text-gray-400 text-xs uppercase mb-1">
								{roundName({ ...s, currentRoundIdx: rIdx })}
							</div>
							{#each round as m, mIdx}
								<div
									class="border p-2 mb-1 {rIdx === s.currentRoundIdx && mIdx === s.currentMatchIdx
										? 'border-turquoise'
										: 'border-white/30'}"
								>
									<div class={m.winner === 1 ? 'text-turquoise' : ''}>
										{m.p1 || '?'} <span class="text-gray-500">({m.scores[1]})</span>
									</div>
									<div class={m.winner === 2 ? 'text-turquoise' : ''}>
										{m.p2 || '?'} <span class="text-gray-500">({m.scores[2]})</span>
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>

				<details class="border p-2 mb-3">
					<summary class="cursor-pointer">Add custom prompt</summary>
					<input class="w-full bg-black border border-white/40 p-2 mt-2" placeholder="Prompt text" bind:value={customPromptText} />
					<select class="bg-black border border-white/40 p-2 mt-2 w-full" bind:value={customPromptTier}>
						<option value="easy">easy</option>
						<option value="medium">medium</option>
						<option value="hard">hard</option>
					</select>
					<button class="border p-2 mt-2 w-full" on:click={addCustom}>Add</button>
				</details>

				<details class="border p-2 mb-3">
					<summary class="cursor-pointer">✨ AI-generate more prompts</summary>
					<div class="flex gap-2 mt-2">
						<input type="number" min="1" max="10" class="w-16 bg-black border border-white/40 p-2" bind:value={aiCount} />
						<select class="bg-black border border-white/40 p-2 flex-1" bind:value={aiTier}>
							<option value="easy">easy</option>
							<option value="medium">medium</option>
							<option value="hard">hard</option>
						</select>
					</div>
					<button class="border p-2 mt-2 w-full" disabled={aiBusy} on:click={generateAiPrompts}>
						{aiBusy ? 'Generating…' : 'Generate'}
					</button>
					{#if aiError}<p class="text-red-400 text-sm mt-1">{aiError}</p>{/if}
					{#if s.customPrompts.length}
						<div class="mt-2 text-xs max-h-32 overflow-auto">
							<div class="text-gray-400 mb-1">Added ({s.customPrompts.length}):</div>
							{#each s.customPrompts as c}
								<div>• [{c.tier}] {c.text}</div>
							{/each}
						</div>
					{/if}
				</details>

				<button class="border p-2 w-full text-sm" on:click={() => sendAction('resetTournament')}>
					Reset tournament
				</button>
			</div>
		</div>
	{/if}
</div>
