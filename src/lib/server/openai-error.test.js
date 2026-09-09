import { describe, it, expect } from 'vitest';
import { toImageGenerationError, blockedPromptError, describeOpenAIError } from './openai-error.js';

/** The shape the openai SDK throws for a refused prompt. */
function apiError({ status, code, message }) {
	const err = new Error(message);
	err.status = status;
	err.code = code;
	err.error = { code, message };
	return err;
}

describe('toImageGenerationError', () => {
	it('treats a moderation block as a retryable blocked prompt', () => {
		const failure = toImageGenerationError(
			apiError({
				status: 400,
				code: 'moderation_blocked',
				message: 'Your request was rejected as a result of our safety system.'
			})
		);
		expect(failure.code).toBe('prompt_blocked');
		expect(failure.reason).toMatch(/contentfilter/i);
	});

	it('names both likely causes, since the API block never says why', () => {
		// Verified against gpt-image-2: the refusal is only ever "rejected by the
		// safety system", with no hint that a character was the problem.
		const failure = toImageGenerationError(
			apiError({
				status: 400,
				code: 'moderation_blocked',
				message: 'Your request was rejected by the safety system.'
			})
		);
		// Verified against gpt-image-2: both a character and an artist's style
		// ("in the style of salvador dali") produce this same blank refusal.
		expect(failure.reason).toMatch(/film of game/);
		expect(failure.reason).toMatch(/kunstenaar/);
		// The filter refused an identical prompt on 1 of 3 tries, so "try again"
		// is real advice, not a platitude.
		expect(failure.reason).toMatch(/nog een keer/);
	});

	it('names copyright when the API does', () => {
		const failure = toImageGenerationError(
			apiError({
				status: 400,
				code: 'content_policy_violation',
				message: 'This request was rejected: the prompt names copyrighted characters.'
			})
		);
		expect(failure.code).toBe('prompt_blocked');
		expect(failure.reason).toMatch(/auteursrechtelijk beschermd/);
	});

	it('separates a rate limit from a blocked prompt', () => {
		const failure = toImageGenerationError(
			apiError({ status: 429, code: 'rate_limit_exceeded', message: 'Rate limit reached' })
		);
		expect(failure.code).toBe('rate_limited');
	});

	it('falls back to a generic technical failure', () => {
		const failure = toImageGenerationError(new Error('socket hang up'));
		expect(failure.code).toBe('error');
		expect(failure.reason).toMatch(/technisch iets mis/);
	});

	it('never leaks an API key into the server-side detail', () => {
		const failure = toImageGenerationError(
			new Error('Incorrect API key provided: sk-proj-abc123DEF. Check your key.')
		);
		expect(failure.message).not.toMatch(/sk-proj-abc123DEF/);
		expect(failure.message).toContain('[redacted]');
	});

	it('is idempotent, so re-classifying in the endpoint is safe', () => {
		const once = toImageGenerationError(
			apiError({ status: 400, code: 'moderation_blocked', message: 'safety system' })
		);
		expect(toImageGenerationError(once)).toBe(once);
	});

	it('names the character the pre-screen identified', () => {
		const failure = blockedPromptError({ kind: 'copyright', subject: 'Scrooge McDuck' });
		expect(failure.code).toBe('prompt_blocked');
		expect(failure.reason).toBe(
			'Scrooge McDuck is auteursrechtelijk beschermd — dat maakt OpenAI niet. Probeer iets anders!'
		);
	});

	it('falls back to a generic copyright reason when it cannot name one', () => {
		const failure = blockedPromptError({ kind: 'copyright', subject: null });
		expect(failure.reason).toMatch(/auteursrechtelijk beschermd/);
	});

	it('uses the safety wording for unsafe content, not the copyright wording', () => {
		const failure = blockedPromptError({ kind: 'unsafe', subject: 'graphic gore' });
		expect(failure.reason).toMatch(/onschuldig/);
		expect(failure.reason).not.toMatch(/auteursrecht/);
	});

	it('describeOpenAIError still prefers the parsed body message', () => {
		expect(describeOpenAIError({ error: { message: 'body msg' }, message: 'outer' })).toBe(
			'body msg'
		);
	});
});
