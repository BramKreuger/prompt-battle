<script>
	import { onMount } from 'svelte';
	import { tournamentState, sendAction, getSocket, getOrCreateClientId } from '$lib/tournament-client.js';

	let clientId;
	let lastVotedPromptKey = null;

	onMount(() => {
		getSocket();
		clientId = getOrCreateClientId();
		const stored = localStorage.getItem('pb:lastVoteKey');
		if (stored) lastVotedPromptKey = stored;
	});

	$: s = $tournamentState;
	$: match = s?.bracket?.[s.currentRoundIdx]?.[s.currentMatchIdx];
	$: cp = s?.currentPrompt;
	$: promptKey = s
		? `${s.currentRoundIdx}-${s.currentMatchIdx}-${match?.promptHistory?.length ?? 0}-${cp?.text ?? ''}`
		: null;
	$: alreadyVoted =
		cp && clientId ? cp.votedClients?.includes(clientId) : false;

	function vote(choice) {
		if (!clientId) return;
		if (s?.status !== 'voting') return;
		if (alreadyVoted) return;
		sendAction('vote', { choice, clientId });
		lastVotedPromptKey = promptKey;
		localStorage.setItem('pb:lastVoteKey', promptKey);
	}
</script>

<svelte:head><title>Audience Vote</title></svelte:head>

<div class="h-full w-full p-4 text-white flex flex-col">
	{#if !s || !match}
		<div class="flex-1 flex items-center justify-center text-2xl text-gray-400">
			Waiting for tournament…
		</div>
	{:else if s.status !== 'voting'}
		<div class="flex-1 flex items-center justify-center text-center">
			<div>
				<div class="text-2xl text-gray-400 mb-2">Voting is closed right now.</div>
				<div class="text-lg">
					Current match: <span class="text-turquoise">{match.p1}</span> vs <span class="text-turquoise">{match.p2}</span>
				</div>
				<div class="text-sm mt-4 text-gray-500">
					Status: <code>{s.status}</code> — this page will update when voting opens.
				</div>
			</div>
		</div>
	{:else}
		<div class="text-center mb-4">
			<div class="text-sm text-gray-400 uppercase">Prompt</div>
			<div class="text-2xl">"{cp.text}"</div>
		</div>

		<div class="flex-1 grid grid-cols-2 gap-3 min-h-0">
			{#each [1, 2] as pid}
				<button
					class="border-2 {alreadyVoted ? 'opacity-60 cursor-not-allowed' : 'hover:bg-turquoise hover:text-black'} p-3 flex flex-col min-h-0"
					on:click={() => vote(pid)}
					disabled={alreadyVoted}
				>
					<div class="text-2xl mb-2">{pid === 1 ? match.p1 : match.p2}</div>
					{#if cp.images[pid]}
						<img src={cp.images[pid]} alt="" class="flex-1 w-full object-contain min-h-0" />
					{/if}
					<div class="mt-2 text-sm italic opacity-70 break-words">"{cp.typed[pid]}"</div>
				</button>
			{/each}
		</div>

		<div class="mt-4 text-center text-sm">
			{#if alreadyVoted}
				<span class="text-turquoise">✅ Vote recorded. Thanks!</span>
			{:else}
				Tap a player to vote.
			{/if}
		</div>
	{/if}
</div>
