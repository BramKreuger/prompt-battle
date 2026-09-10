<script>
	import { onMount } from 'svelte';
	import { tournamentState, getSocket } from '$lib/tournament-client.js';
	import Countdown from '$lib/Countdown.svelte';
	import Confetti from '../Confetti.svelte';
	import WelcomeScreen from './WelcomeScreen.svelte';
	import {
		audioEnabled,
		enableAudio,
		startTenseMusic,
		stopTenseMusic,
		promptSting,
		revealSting,
		winnerFanfare,
		matchFanfare,
		championFanfare
	} from '$lib/audio.js';
	import QRCode from 'qrcode';

	let voteQrDataUrl = '';

	// How many of the closing rounds get the dramatic intro soundtrack
	// (Lexicon_Assassin) at their match intro. 1 = the final only, 2 = final
	// plus the semifinals, and so on. Every other round is carried by the tense
	// bed during prompting instead, so the soundtrack keeps its impact.
	const INTRO_MUSIC_LAST_ROUNDS = 1;

	/** @type {number | null} */
	let confettiFor = null;
	/** @type {any} */
	let confettiTimer;

	/** @type {HTMLAudioElement | null} */
	let finalAudioEl = null;
	let finalAudioPlaying = false;
	/** @type {number | null} */
	let finalAudioPlayedForRound = null;

	onMount(async () => {
		const sock = getSocket();
		sock.on('celebrate', (winnerId) => {
			confettiFor = Number(winnerId);
			clearTimeout(confettiTimer);
			confettiTimer = setTimeout(() => (confettiFor = null), 4000);
		});

		const voteUrl = window.location.origin + '/vote';
		voteQrDataUrl = await QRCode.toDataURL(voteUrl, {
			width: 512,
			margin: 1,
			color: { dark: '#000000', light: '#ffffff' }
		});
	});

	let muted = false;

	function handleEnable() {
		enableAudio();
		if (finalAudioEl) finalAudioEl.load();
		// Sound may be switched on mid-round, after the transition that would
		// have started the music has already gone by.
		if (s?.status === 'prompting' || s?.status === 'generating') startTenseMusic();
	}

	function toggleMute() {
		muted = !muted;
		if (muted) {
			stopTenseMusic({ fade: 0.3 });
			stopFinalAudio();
		} else if (s?.status === 'prompting' || s?.status === 'generating') {
			startTenseMusic();
		}
	}

	/**
	 * One cue per phase change. Guarded on the previous status because the
	 * server re-broadcasts state on every action — every single audience vote
	 * would otherwise re-fire the reveal sting.
	 *
	 * @param {string} status
	 */
	function playCueFor(status) {
		if (!$audioEnabled || muted) return;
		switch (status) {
			case 'prompting':
				// The final's intro music must not play under the tense bed.
				stopFinalAudio();
				promptSting();
				startTenseMusic();
				break;
			case 'generating':
				// Deliberately nothing: the bed keeps running over the wait.
				break;
			case 'voting':
				stopTenseMusic({ fade: 0.4 });
				revealSting();
				break;
			case 'revealing':
				stopTenseMusic({ fade: 0.4 });
				winnerFanfare();
				break;
			case 'match_complete':
				stopTenseMusic({ fade: 0.4 });
				matchFanfare();
				break;
			case 'tournament_complete':
				stopTenseMusic({ fade: 0.4 });
				championFanfare();
				break;
			default:
				stopTenseMusic({ fade: 0.6 });
		}
	}

	$: s = $tournamentState;
	$: match = s?.bracket?.[s.currentRoundIdx]?.[s.currentMatchIdx];
	$: cp = s?.currentPrompt;
	$: roundLabel = roundName(s);
	$: totalVotes = (cp?.votes?.[1] || 0) + (cp?.votes?.[2] || 0);
	$: pct1 = totalVotes ? Math.round((cp.votes[1] / totalVotes) * 100) : 0;
	$: pct2 = totalVotes ? 100 - pct1 : 0;
	// 0 = the final itself, 1 = the semifinals, ...
	$: roundsFromFinal = s?.bracket?.length ? s.bracket.length - 1 - s.currentRoundIdx : null;
	$: isFinalRound = roundsFromFinal === 0;
	$: playsIntroMusic = roundsFromFinal !== null && roundsFromFinal < INTRO_MUSIC_LAST_ROUNDS;
	$: gameActive = s && s.status !== 'idle' && s.status !== 'configured';

	/** @type {string | null} */
	let lastStatus = null;
	$: if (s?.status && s.status !== lastStatus) {
		lastStatus = s.status;
		playCueFor(s.status);
	}

	$: if (
		s?.status === 'match_intro' &&
		playsIntroMusic &&
		!muted &&
		finalAudioPlayedForRound !== s.currentRoundIdx
	) {
		finalAudioPlayedForRound = s.currentRoundIdx;
		finalAudioPlaying = true;
		queueMicrotask(() => {
			if (finalAudioEl) {
				finalAudioEl.currentTime = 0;
				finalAudioEl.play().catch(() => {
					finalAudioPlaying = false;
				});
			}
		});
	}

	function onAudioEnded() {
		finalAudioPlaying = false;
	}

	function stopFinalAudio() {
		if (finalAudioEl) finalAudioEl.pause();
		finalAudioPlaying = false;
	}

	function roundName(state) {
		if (!state?.config) return '';
		const total = Math.log2(state.config.size);
		const fromFinal = total - 1 - state.currentRoundIdx;
		if (fromFinal === 0) return 'Final';
		if (fromFinal === 1) return 'Semifinal';
		if (fromFinal === 2) return 'Quarterfinal';
		return `Round ${state.currentRoundIdx + 1}`;
	}
</script>

<svelte:head><title>Stage</title></svelte:head>

<div class="h-full w-full flex flex-col p-6 text-white">
	{#if !s || s.status === 'idle' || s.status === 'configured'}
		<WelcomeScreen {voteQrDataUrl} config={s?.config} />
	{:else if s.status === 'tournament_complete'}
		<div class="flex-1 flex flex-col items-center justify-center">
			<div class="text-3xl mb-4">🏆 Champion</div>
			<div class="text-9xl text-turquoise">{s.champion}</div>
		</div>
	{:else if match}
		<!-- Header: round + scores -->
		<div class="flex justify-between items-center mb-4">
			<div class="text-3xl">{roundLabel}</div>
			<div class="text-3xl">
				<span class={match.winner === 1 ? 'text-turquoise' : ''}>{match.p1}</span>
				<span class="mx-3 text-turquoise">{match.scores[1]} – {match.scores[2]}</span>
				<span class={match.winner === 2 ? 'text-turquoise' : ''}>{match.p2}</span>
			</div>
		</div>

		{#if s.status === 'match_intro'}
			<div class="flex-1 flex flex-col items-center justify-center">
				<div class="text-2xl text-gray-400 mb-2">Next match</div>
				<div class="text-7xl">
					<span class="text-turquoise">{match.p1}</span>
					<span class="text-gray-500 mx-4">vs</span>
					<span class="text-turquoise">{match.p2}</span>
				</div>
			</div>
		{:else if s.status === 'match_complete'}
			<div class="flex-1 flex flex-col items-center justify-center">
				<div class="text-3xl mb-3">🏆 Match winner</div>
				<div class="text-8xl text-turquoise">{match.winner === 1 ? match.p1 : match.p2}</div>
			</div>
		{:else}
			<!-- Prompt -->
			<div class="border border-turquoise p-4 mb-4 text-center relative">
				<div class="text-sm text-gray-400 uppercase tracking-widest">Prompt ({cp.difficulty})</div>
				<div class="text-5xl mt-1">"{cp.text}"</div>
				{#if s.status === 'prompting' && cp.deadlineTs}
					<div class="absolute top-2 right-4">
						<Countdown deadlineTs={cp.deadlineTs} size="lg" playBeeps={true} />
					</div>
				{:else if s.status === 'generating' && cp.generateDeadlineTs && (cp.errors?.[1] || cp.errors?.[2])}
					<div class="absolute top-2 right-4">
						<Countdown deadlineTs={cp.generateDeadlineTs} size="md" />
					</div>
				{/if}
			</div>

			<!-- Two columns -->
			<div class="flex-1 grid grid-cols-2 gap-4 min-h-0">
				{#each [1, 2] as pid}
					<div
						class="border {cp.winner === pid
							? 'border-turquoise border-4'
							: 'border-white/30'} p-3 flex flex-col min-h-0"
					>
						<div class="text-2xl mb-2">{pid === 1 ? match.p1 : match.p2}</div>
						{#if s.status === 'voting' || s.status === 'revealing'}
							{#if cp.images[pid]}
								<img src={cp.images[pid]} alt="" class="flex-1 w-full object-contain min-h-0" />
							{:else}
								<div
									class="flex-1 flex flex-col items-center justify-center text-center min-h-0 border border-red-500/40 bg-red-500/5 p-4"
								>
									<div class="text-6xl mb-3">
										{cp.errors?.[pid]?.code === 'prompt_blocked' ? '🚫' : '⚠️'}
									</div>
									<div class="text-2xl text-red-300">
										{cp.errors?.[pid]?.code === 'prompt_blocked'
											? 'Prompt geblokkeerd door het filter'
											: 'Geen afbeelding'}
									</div>
								</div>
							{/if}
							{#if s.status === 'voting' || s.status === 'revealing'}
								<div class="mt-2">
									<div class="flex justify-between text-sm">
										<span>Votes: {cp.votes[pid]}</span>
										<span>{pid === 1 ? pct1 : pct2}%</span>
									</div>
									<div class="h-3 bg-white/10 mt-1">
										<div
											class="h-full bg-turquoise transition-all"
											style="width: {pid === 1 ? pct1 : pct2}%"
										/>
									</div>
								</div>
							{/if}
						{:else if s.status === 'generating'}
							<div class="flex-1 flex flex-col items-center justify-center text-center text-2xl">
								{#if cp.imageReady[pid]}
									<span class="text-gray-400">✅</span>
								{:else if cp.errors?.[pid]}
									<span class="text-5xl mb-2">
										{cp.errors?.[pid]?.code === 'prompt_blocked' ? '🚫' : '⚠️'}
									</span>
									<span class="text-red-300">
										{cp.errors?.[pid]?.code === 'prompt_blocked'
											? 'Geblokkeerd — nieuwe poging'
											: 'Mislukt — nieuwe poging'}
									</span>
								{:else}
									<span class="text-gray-400">Generating…</span>
								{/if}
							</div>
						{:else}
							<div class="flex-1 p-2 text-2xl italic overflow-auto whitespace-pre-wrap break-words">
								{cp.typed[pid] || '...'}
							</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if s.status === 'voting'}
				<div class="mt-4 text-center text-xl text-turquoise">🗳️ Audience, vote now!</div>
			{/if}
		{/if}
	{/if}
</div>

{#if gameActive && voteQrDataUrl}
	<div class="qr-thumb">
		<img src={voteQrDataUrl} alt="QR code to vote" />
	</div>
{/if}

{#if confettiFor}
	<Confetti />
{/if}

{#if !$audioEnabled}
	<button
		on:click={handleEnable}
		class="fixed bottom-4 right-4 bg-turquoise text-black px-4 py-2 text-sm z-40 hover:opacity-90"
	>
		🔊 Enable sounds
	</button>
{:else}
	<button
		on:click={toggleMute}
		title="Mute alle muziek en effecten"
		class="fixed bottom-4 right-4 px-3 py-2 text-sm z-40 border border-white/40 bg-black/60 text-white hover:opacity-90"
	>
		{muted ? '🔇 Geluid uit' : '🔊 Geluid aan'}
	</button>
{/if}

<audio
	bind:this={finalAudioEl}
	src="/Lexicon_Assassin.mp4"
	on:ended={onAudioEnded}
	preload="auto"
/>
{#if finalAudioPlaying}
	<button
		on:click={stopFinalAudio}
		class="fixed top-4 right-4 bg-black/60 text-white px-3 py-1 text-sm z-40 border border-white/40"
	>
		🎵 Intro music — stop
	</button>
{/if}

<style>
	:global(body) {
		overflow: hidden;
	}

	.qr-thumb {
		position: fixed;
		bottom: 1rem;
		left: 1rem;
		z-index: 50;
		cursor: pointer;
	}

	.qr-thumb img {
		width: 5rem;
		height: 5rem;
		border-radius: 0.5rem;
		transition: all 0.2s ease;
	}

	.qr-thumb:hover img {
		width: 20rem;
		height: 20rem;
	}
</style>
