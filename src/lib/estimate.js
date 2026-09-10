/**
 * How long a tournament actually takes, so the host can pick a player count
 * that fits the slot they have.
 *
 * Everything is in seconds. `generate` is measured — gpt-image-2 at low
 * quality lands in about 20s, and a refused prompt plus a retry costs more, so
 * 25 is the honest planning number. The rest are the realistic minimums of
 * running this live: an audience needs time to look and vote, and players have
 * to physically swap seats between matches.
 */
export const TIMINGS = {
	generate: 25,
	voting: 30,
	reveal: 15,
	matchChangeover: 45,
	championCelebration: 30,
	/** Only used to estimate when the timer is switched off. */
	noTimerAssumption: 90
};

/**
 * A best-of-N match is over as soon as someone leads by enough, so the number
 * of prompts actually played is a range, not a number.
 *
 * @param {number} promptsPerMatch
 */
export function promptsPerMatchRange(promptsPerMatch) {
	return { min: Math.ceil((promptsPerMatch + 1) / 2), max: promptsPerMatch };
}

/**
 * @param {{ size: number, promptsPerMatch: number, promptTimerSeconds: number }} config
 */
export function estimateTournament({ size, promptsPerMatch, promptTimerSeconds }) {
	const timerOff = !(promptTimerSeconds > 0);
	const typing = timerOff ? TIMINGS.noTimerAssumption : promptTimerSeconds;
	const perPrompt = typing + TIMINGS.generate + TIMINGS.voting + TIMINGS.reveal;
	// Single elimination: every match knocks exactly one player out.
	const matches = Math.max(1, size - 1);
	const prompts = promptsPerMatchRange(promptsPerMatch);
	const overhead = matches * TIMINGS.matchChangeover + TIMINGS.championCelebration;

	return {
		matches,
		perPrompt,
		prompts,
		perMatchMin: TIMINGS.matchChangeover + prompts.min * perPrompt,
		perMatchMax: TIMINGS.matchChangeover + prompts.max * perPrompt,
		minSeconds: overhead + matches * prompts.min * perPrompt,
		maxSeconds: overhead + matches * prompts.max * perPrompt,
		typing,
		timerOff
	};
}

/**
 * "1 u 25 min" / "35 min". Rounded, since this is an estimate — coarsely for a
 * whole tournament, but per minute for a single match, where 5-minute buckets
 * would collapse the whole range into one number.
 *
 * @param {number} seconds
 * @param {{ round?: number }} [opts]
 */
export function formatDuration(seconds, { round = 5 } = {}) {
	const rounded = Math.max(round, Math.round(seconds / 60 / round) * round);
	const hours = Math.floor(rounded / 60);
	const mins = rounded % 60;
	if (!hours) return `${mins} min`;
	return mins ? `${hours} u ${mins} min` : `${hours} u`;
}
