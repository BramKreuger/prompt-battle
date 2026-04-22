<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { tournamentState, sendAction, getSocket } from '$lib/tournament-client.js';

	let size = 4;
	let promptsPerMatch = 3;
	let promptTimerSeconds = 120;
	let players = ['', '', '', ''];

	const TIMER_OPTIONS = [
		{ label: '60s', value: 60 },
		{ label: '90s', value: 90 },
		{ label: '2 min', value: 120 },
		{ label: '3 min', value: 180 },
		{ label: '5 min', value: 300 },
		{ label: 'No timer', value: 0 }
	];

	onMount(() => {
		getSocket();
	});

	$: {
		if (players.length !== size) {
			const copy = [...players];
			copy.length = size;
			for (let i = 0; i < size; i++) if (!copy[i]) copy[i] = '';
			players = copy;
		}
	}

	$: namesFilled = players.every((n) => n && n.trim().length > 0);
	$: namesUnique = new Set(players.map((n) => n.trim().toLowerCase())).size === size;
	$: canSubmit = namesFilled && namesUnique;

	function createTournament() {
		if (!canSubmit) return;
		sendAction('setup', {
			size,
			promptsPerMatch: Number(promptsPerMatch),
			promptTimerSeconds: Number(promptTimerSeconds),
			players: players.map((n) => n.trim())
		});
		goto('/admin');
	}
</script>

<svelte:head><title>Tournament Setup</title></svelte:head>

<div class="p-6 text-white max-w-3xl mx-auto overflow-auto h-full">
	<h1 class="text-4xl mb-6">Tournament Setup</h1>

	{#if $tournamentState && $tournamentState.status !== 'idle'}
		<div class="border border-yellow-500 p-3 mb-4 text-yellow-300">
			A tournament is already in progress (<code>{$tournamentState.status}</code>). Creating a new
			one will reset it.
			<button
				class="ml-2 underline"
				on:click={() => sendAction('resetTournament')}>Reset now</button
			>
		</div>
	{/if}

	<div class="mb-6">
		<label class="block mb-2">Number of players</label>
		<div class="flex gap-2">
			{#each [2, 4, 8, 16] as n}
				<button
					class="border p-3 px-5 {size === n ? 'bg-turquoise text-black' : ''}"
					on:click={() => (size = n)}>{n}</button
				>
			{/each}
		</div>
	</div>

	<div class="mb-6">
		<label class="block mb-2">Prompts per match (best-of)</label>
		<div class="flex gap-2">
			{#each [1, 3, 5] as n}
				<button
					class="border p-3 px-5 {promptsPerMatch === n ? 'bg-turquoise text-black' : ''}"
					on:click={() => (promptsPerMatch = n)}>Best of {n}</button
				>
			{/each}
		</div>
		<p class="text-sm text-gray-400 mt-1">
			If tied after {promptsPerMatch} prompts, sudden-death prompts are played until someone leads.
		</p>
	</div>

	<div class="mb-6">
		<label class="block mb-2">Prompt timer (auto-generates when time runs out)</label>
		<div class="flex gap-2 flex-wrap">
			{#each TIMER_OPTIONS as t}
				<button
					class="border p-3 px-5 {promptTimerSeconds === t.value ? 'bg-turquoise text-black' : ''}"
					on:click={() => (promptTimerSeconds = t.value)}>{t.label}</button
				>
			{/each}
		</div>
	</div>

	<div class="mb-6">
		<label class="block mb-2">Player names</label>
		<div class="grid grid-cols-2 gap-2">
			{#each players as _p, i}
				<input
					class="bg-black border border-white/40 p-2 text-white"
					placeholder={'Player ' + (i + 1)}
					bind:value={players[i]}
				/>
			{/each}
		</div>
		{#if !namesFilled}
			<p class="text-sm text-red-400 mt-2">Fill in every name.</p>
		{:else if !namesUnique}
			<p class="text-sm text-red-400 mt-2">Names must be unique.</p>
		{/if}
	</div>

	<button
		class="border-2 p-4 px-8 text-xl {canSubmit
			? 'bg-turquoise text-black'
			: 'opacity-50 cursor-not-allowed'}"
		on:click={createTournament}
		disabled={!canSubmit}>Create tournament →</button
	>
</div>
