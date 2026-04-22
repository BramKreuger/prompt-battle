<script>
</script>

<svelte:head>
	<title>Home</title>
	<meta name="description" content="Prompt Battle" />
</svelte:head>

<section class="text-xl md:text-2xl">
	<h1 class="text-center mb-4 text-2xl md:text-3xl">Screens</h1>
	<div class="grid gap-3 w-full">
		<a href="/setup" class="border-2 text-center p-3 bg-blue-900">🛠 Setup (start here)</a>
		<a href="/admin" class="border-2 text-center p-3 bg-blue-900">🎛 Admin / Controller</a>
		<a href="/stage" class="border-2 text-center p-3 bg-blue-900">📺 Stage (big screen)</a>
		<a href="/vote" class="border-2 text-center p-3 bg-blue-900">🗳 Vote (audience)</a>
		<div class="grid grid-cols-2 gap-3">
			<a href="/player1" class="border-2 text-center p-3 bg-blue-900">🎤 Player 1</a>
			<a href="/player2" class="border-2 text-center p-3 bg-blue-900">🎤 Player 2</a>
		</div>
		<div class="grid grid-cols-2 gap-3 opacity-70">
			<a href="/audience1" class="border text-center p-2 bg-blue-900">Audience 1 (legacy)</a>
			<a href="/audience2" class="border text-center p-2 bg-blue-900">Audience 2 (legacy)</a>
		</div>
	</div>
</section>

<style>
	section {
		color: white;
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		flex: 0.6;
		padding: 1rem;
	}

	h1 {
		width: 100%;
	}
</style>
