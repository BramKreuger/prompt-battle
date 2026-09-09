import { describe, it, expect, beforeEach } from 'vitest';
import { dispatch, getState } from './tournament-state.js';

/** Drive a fresh 2-player tournament up to the generating phase. */
function startGenerating() {
	dispatch({ type: 'resetTournament' });
	dispatch({
		type: 'setup',
		payload: { size: 2, promptsPerMatch: 3, players: ['Ann', 'Bob'], promptTimerSeconds: 60 }
	});
	dispatch({ type: 'startTournament' });
	dispatch({ type: 'startPrompt' });
	dispatch({ type: 'triggerGenerate' });
	return getState();
}

describe('generating phase cannot deadlock', () => {
	beforeEach(() => {
		dispatch({ type: 'resetTournament' });
	});

	it('arms a deadline the moment generating starts', () => {
		const s = startGenerating();
		expect(s.status).toBe('generating');
		expect(s.currentPrompt.generateDeadlineTs).toBeGreaterThan(Date.now());
	});

	it('keeps a blocked player in the round so they can retry', () => {
		startGenerating();
		dispatch({
			type: 'generationFailed',
			payload: { playerId: 1, code: 'prompt_blocked', reason: 'Scrooge McDuck is beschermd' }
		});
		const s = getState();
		// Not marked ready: the retry window is the whole point.
		expect(s.currentPrompt.imageReady[1]).toBe(false);
		expect(s.currentPrompt.errors[1]?.code).toBe('prompt_blocked');
		expect(s.status).toBe('generating');
	});

	it('clears the failure and opens voting when a retry lands', () => {
		startGenerating();
		dispatch({ type: 'generationFailed', payload: { playerId: 1, code: 'prompt_blocked' } });
		dispatch({
			type: 'imageReady',
			payload: { playerId: 2, imageUrl: 'data:image/jpeg;base64,b' }
		});
		expect(getState().status).toBe('generating');

		dispatch({
			type: 'imageReady',
			payload: { playerId: 1, imageUrl: 'data:image/jpeg;base64,a' }
		});
		const s = getState();
		expect(s.status).toBe('voting');
		expect(s.currentPrompt.errors[1]).toBeNull();
		expect(s.currentPrompt.generateDeadlineTs).toBeNull();
	});

	it('resolves to voting without the missing image when the window runs out', () => {
		startGenerating();
		dispatch({ type: 'generationFailed', payload: { playerId: 1, code: 'prompt_blocked' } });
		dispatch({
			type: 'imageReady',
			payload: { playerId: 2, imageUrl: 'data:image/jpeg;base64,b' }
		});

		dispatch({ type: 'resolveGeneration' });
		const s = getState();
		expect(s.status).toBe('voting');
		expect(s.currentPrompt.images[1]).toBeNull();
		expect(s.currentPrompt.images[2]).toBe('data:image/jpeg;base64,b');
		expect(s.currentPrompt.generateDeadlineTs).toBeNull();
	});

	it('resolves even when both players are blocked, so the show goes on', () => {
		startGenerating();
		dispatch({ type: 'generationFailed', payload: { playerId: 1, code: 'prompt_blocked' } });
		dispatch({ type: 'generationFailed', payload: { playerId: 2, code: 'prompt_blocked' } });
		dispatch({ type: 'resolveGeneration' });
		expect(getState().status).toBe('voting');
	});

	it('still accepts a late retry once voting has opened', () => {
		startGenerating();
		dispatch({ type: 'imageReady', payload: { playerId: 2, imageUrl: 'b' } });
		dispatch({ type: 'resolveGeneration' });
		expect(getState().status).toBe('voting');

		dispatch({ type: 'imageReady', payload: { playerId: 1, imageUrl: 'late' } });
		expect(getState().currentPrompt.images[1]).toBe('late');
		expect(getState().status).toBe('voting');
	});

	it('a resolved round still scores and advances the match', () => {
		startGenerating();
		dispatch({ type: 'generationFailed', payload: { playerId: 1, code: 'prompt_blocked' } });
		dispatch({ type: 'imageReady', payload: { playerId: 2, imageUrl: 'b' } });
		dispatch({ type: 'resolveGeneration' });
		dispatch({ type: 'vote', payload: { choice: 2, clientId: 'c1' } });
		dispatch({ type: 'revealPromptWinner' });

		const s = getState();
		expect(s.status).toBe('revealing');
		expect(s.currentPrompt.winner).toBe(2);
		const match = s.bracket[0][0];
		expect(match.scores[2]).toBe(1);
		// The failure is kept in history, so a recap can explain the empty card.
		expect(match.promptHistory[0].errors[1]?.code).toBe('prompt_blocked');

		dispatch({ type: 'nextPromptOrMatch' });
		expect(getState().status).toBe('prompting');
	});

	it('ignores stray actions from other phases', () => {
		dispatch({ type: 'resetTournament' });
		dispatch({
			type: 'setup',
			payload: { size: 2, promptsPerMatch: 3, players: ['Ann', 'Bob'], promptTimerSeconds: 60 }
		});
		dispatch({ type: 'startTournament' });
		dispatch({ type: 'startPrompt' });
		// Still prompting: neither a failure nor a resolve may skip the phase.
		dispatch({ type: 'generationFailed', payload: { playerId: 1, code: 'prompt_blocked' } });
		dispatch({ type: 'resolveGeneration' });
		expect(getState().status).toBe('prompting');
		expect(getState().currentPrompt.errors[1]).toBeNull();
	});
});
