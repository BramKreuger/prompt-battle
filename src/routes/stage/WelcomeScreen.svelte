<script>
	// Pre-show slide, projected behind the host while the room fills up. Read
	// from a distance by people who have never seen this game, so: few words,
	// big type, and the two things they can act on (sign up, or scan to vote)
	// separated out rather than buried in a paragraph.
	//
	// Two layout lessons are baked in here:
	// - Flex, not grid. A grid row sizes to its content and then overflows a
	//   too-short container, which had the columns colliding with the line
	//   underneath. Flex children shrink instead.
	// - Type sized in vh, not fixed steps. The projector's resolution is not
	//   known in advance, and a fixed scale that fits 1080p clips at 720p.
	export let voteQrDataUrl = '';
	/** @type {any} */
	export let config = null;

	$: timerLabel = config?.promptTimerSeconds
		? `${config.promptTimerSeconds} seconden`
		: 'een paar minuten';
</script>

<div class="slide flex-1 min-h-0 flex flex-col pb-10">
	<div class="text-center">
		<h1 class="title text-turquoise">PROMPT BATTLE</h1>
		<p class="subtitle text-gray-300">Wie schrijft de beste prompt? Het publiek beslist.</p>
	</div>

	<div class="flex-1 min-h-0 flex gap-5 mt-4">
		<!-- How it works -->
		<div class="flex-[2] min-h-0 border border-white/30 p-5 flex flex-col overflow-hidden">
			<div class="label text-gray-400 uppercase tracking-widest">Hoe werkt het?</div>
			<ol class="steps">
				<li><span class="text-turquoise">1.</span> Twee spelers krijgen dezelfde opdracht.</li>
				<li>
					<span class="text-turquoise">2.</span> Je hebt
					<span class="text-turquoise">{timerLabel}</span> om een prompt te typen.
				</li>
				<li><span class="text-turquoise">3.</span> De AI maakt van beide prompts een beeld.</li>
				<li>
					<span class="text-turquoise">4.</span> Het publiek stemt. Wie wint, gaat door naar de volgende
					ronde.
				</li>
			</ol>
			<div class="tip mt-auto text-gray-300">
				<span class="text-yellow-300">Tip:</span> noem geen bekende figuren (Mickey Mouse, Superman,
				Dali) — die weigert de AI. Omschrijf ze in je eigen woorden, dát is de kunst.
			</div>
		</div>

		<!-- The two things the audience can act on -->
		<div class="flex-1 min-h-0 flex flex-col gap-4">
			<div class="border-2 border-turquoise p-4">
				<div class="cta text-turquoise">Meedoen?</div>
				<p class="body text-gray-200">
					Meld je aan bij de host. Je speelt één tegen één op het podium — typen kun je al.
				</p>
			</div>

			<div
				class="border border-white/30 p-4 flex-1 min-h-0 flex flex-col items-center justify-center overflow-hidden"
			>
				<div class="cta">Alleen stemmen?</div>
				<p class="body text-gray-300">Scan met je telefoon</p>
				{#if voteQrDataUrl}
					<img
						src={voteQrDataUrl}
						alt="QR-code om te stemmen"
						class="mt-2 min-h-0 flex-1 object-contain rounded-lg"
					/>
				{/if}
			</div>
		</div>
	</div>

	{#if config?.players?.length}
		<div class="mt-4 text-center">
			<div class="label text-gray-400 uppercase tracking-widest">
				Deelnemers ({config.players.length})
			</div>
			<div class="players flex flex-wrap justify-center gap-x-5">
				{#each config.players as name}
					<span class="text-turquoise">{name}</span>
				{/each}
			</div>
		</div>
	{:else}
		<p class="body mt-4 text-center text-gray-500">De host stelt het toernooi nog samen…</p>
	{/if}
</div>

<style>
	/* Everything scales with the screen's height, so the slide fits a 720p
	   projector and a 4K screen without clipping or leaving the type tiny. */
	.title {
		font-size: clamp(1.75rem, 7.5vh, 5rem);
		line-height: 1.1;
	}
	.subtitle {
		font-size: clamp(0.85rem, 3vh, 2rem);
		margin-top: 0.25rem;
	}
	.label {
		font-size: clamp(0.7rem, 1.9vh, 1.1rem);
		margin-bottom: 0.6rem;
	}
	.steps {
		font-size: clamp(0.85rem, 3.2vh, 2rem);
		display: flex;
		flex-direction: column;
		gap: clamp(0.4rem, 1.6vh, 1.1rem);
	}
	.tip {
		font-size: clamp(0.7rem, 2.1vh, 1.25rem);
		padding-top: clamp(0.5rem, 1.6vh, 1.1rem);
		border-top: 1px solid rgb(255 255 255 / 0.2);
	}
	.cta {
		font-size: clamp(1.1rem, 4vh, 2.5rem);
		line-height: 1.15;
	}
	.body {
		font-size: clamp(0.75rem, 2.3vh, 1.4rem);
		margin-top: 0.25rem;
	}
	.players {
		font-size: clamp(0.9rem, 3vh, 1.9rem);
		margin-top: 0.25rem;
	}
</style>
