import { describe, it, expect } from 'vitest';
import { estimateTournament, promptsPerMatchRange, formatDuration, TIMINGS } from './estimate.js';

describe('promptsPerMatchRange', () => {
	it('needs a majority of the prompts to win', () => {
		expect(promptsPerMatchRange(1)).toEqual({ min: 1, max: 1 });
		expect(promptsPerMatchRange(3)).toEqual({ min: 2, max: 3 });
		expect(promptsPerMatchRange(5)).toEqual({ min: 3, max: 5 });
	});
});

describe('estimateTournament', () => {
	it('plays size - 1 matches in single elimination', () => {
		for (const [size, matches] of [
			[2, 1],
			[4, 3],
			[8, 7],
			[16, 15]
		]) {
			expect(estimateTournament({ size, promptsPerMatch: 3, promptTimerSeconds: 60 }).matches).toBe(
				matches
			);
		}
	});

	it('adds up one prompt from the four phases a prompt goes through', () => {
		const e = estimateTournament({ size: 4, promptsPerMatch: 3, promptTimerSeconds: 45 });
		expect(e.perPrompt).toBe(45 + TIMINGS.generate + TIMINGS.voting + TIMINGS.reveal);
	});

	it('gives a range, because a best-of-3 can end after two prompts', () => {
		const e = estimateTournament({ size: 8, promptsPerMatch: 3, promptTimerSeconds: 60 });
		expect(e.minSeconds).toBeLessThan(e.maxSeconds);
		// 7 matches x 1 extra prompt is exactly the spread.
		expect(e.maxSeconds - e.minSeconds).toBe(7 * e.perPrompt);
	});

	it('a shorter timer shortens the whole tournament', () => {
		const long = estimateTournament({ size: 8, promptsPerMatch: 3, promptTimerSeconds: 120 });
		const short = estimateTournament({ size: 8, promptsPerMatch: 3, promptTimerSeconds: 30 });
		expect(short.maxSeconds).toBeLessThan(long.maxSeconds);
	});

	it('falls back to an assumption when the timer is off', () => {
		const e = estimateTournament({ size: 4, promptsPerMatch: 3, promptTimerSeconds: 0 });
		expect(e.timerOff).toBe(true);
		expect(e.typing).toBe(TIMINGS.noTimerAssumption);
	});
});

describe('formatDuration', () => {
	it('rounds to 5 minutes and switches to hours', () => {
		expect(formatDuration(35 * 60)).toBe('35 min');
		expect(formatDuration(60 * 60)).toBe('1 hr');
		expect(formatDuration(85 * 60)).toBe('1 hr 25 min');
	});

	it('never rounds down to nothing', () => {
		expect(formatDuration(30)).toBe('5 min');
		expect(formatDuration(30, { round: 1 })).toBe('1 min');
	});

	it('keeps per-minute detail for a single match', () => {
		// 5-minute buckets turned a 4-6 minute match range into "5 min - 5 min".
		expect(formatDuration(245, { round: 1 })).toBe('4 min');
		expect(formatDuration(345, { round: 1 })).toBe('6 min');
	});
});
