/**
 * Extract a short, safe description from an OpenAI SDK error.
 *
 * Never return or log the raw error object: it carries the request context,
 * including the `Authorization: Bearer sk-...` header, which is how the live
 * key ended up in the Railway deploy logs.
 *
 * OpenAI's own error text can also echo a partially masked key
 * (`sk-proj-****EKEY`), so scrub anything key-shaped before it reaches a log.
 *
 * @param {any} err
 */
export function describeOpenAIError(err) {
	const detail =
		// v4+ APIError exposes the parsed body here; `.message` is the fallback.
		err?.error?.message ??
		// v3 (axios) shape, kept so this stays correct if anything still uses it.
		err?.response?.data?.error?.message ??
		err?.message ??
		'Unknown error';
	return String(detail).replace(/\b(sk|rk)-[A-Za-z0-9_*-]+/g, '[redacted]');
}

/**
 * Reasons shown to players — full sentences, authored here rather than passed
 * through from the API: upstream error text is never safe to echo to the
 * browser (see the redaction note above), and it reads badly on a stage screen.
 */
const REASONS = {
	copyright: 'Dit is auteursrechtelijk beschermd — dat maakt OpenAI niet. Probeer iets anders!',
	// Reached when the pre-screen did not see it coming, so it has to cover
	// every likely cause. Measured against gpt-image-2: the filter is not
	// deterministic — "a surreal dreamlike landscape with melting clocks" was
	// refused on 1 of 3 identical attempts — so retrying the same prompt really
	// is worth a shot, and is the first thing to suggest. It also refuses some
	// artists by name ("in the style of salvador dali" is blocked, while van
	// gogh and picasso are not), hence the hint about dropping names.
	safety:
		'Het contentfilter van OpenAI weigerde deze prompt. Probeer het nog een keer — vaak lukt het dan wél. Zo niet: laat namen weg (een figuur uit een film of game, of een kunstenaar) en omschrijf het zelf!',
	unsafe:
		'Deze prompt komt niet door het contentfilter van OpenAI. Probeer iets anders — houd het een beetje onschuldig!',
	rate_limited: 'De beeld-API zit even vol. Probeer het direct nog een keer!',
	error: 'Er ging technisch iets mis bij het genereren. Probeer het nog een keer!',
	empty: 'Je hebt nog niets getypt. Typ een prompt en probeer het opnieuw.'
};

/**
 * An image generation failure, already split into what the player may see
 * (`reason`) and what only the server log may see (`message`).
 */
export class ImageGenerationError extends Error {
	/**
	 * @param {'prompt_blocked' | 'rate_limited' | 'error' | 'empty_prompt'} code
	 * @param {string} reason  player-facing, a complete sentence
	 * @param {string} detail  server-only, already redacted
	 * @param {boolean} retryable  is sending the same prompt again worth a try?
	 */
	constructor(code, reason, detail, retryable) {
		super(detail);
		this.name = 'ImageGenerationError';
		this.code = code;
		this.reason = reason;
		this.retryable = retryable;
	}
}

/**
 * The reason for a prompt the pre-screen caught, naming the character when it
 * managed to identify one — "Scrooge McDuck is auteursrechtelijk beschermd" is
 * a far more useful thing to read on stage than a generic filter message.
 *
 * @param {{ kind: 'copyright' | 'unsafe', subject: string | null }} screened
 */
export function blockedPromptError(screened) {
	const reason =
		screened.kind === 'unsafe'
			? REASONS.unsafe
			: screened.subject
			? `${screened.subject} is auteursrechtelijk beschermd — dat maakt OpenAI niet. Probeer iets anders!`
			: REASONS.copyright;
	// Not retryable: the pre-screen is deterministic, so the same prompt will
	// be refused again. The player has to change it.
	return new ImageGenerationError(
		'prompt_blocked',
		reason,
		`pre-screened as ${screened.kind}: ${screened.subject || 'unnamed'}`,
		false
	);
}

/** The player pressed generate without typing anything. */
export function emptyPromptError() {
	return new ImageGenerationError('empty_prompt', REASONS.empty, 'empty prompt', false);
}

/**
 * Turn any image-API failure into an ImageGenerationError, distinguishing a
 * refused prompt (recoverable — the player can retype and retry) from an
 * infrastructure problem (not their fault).
 *
 * OpenAI rejects a prompt like "scrooge mcduck" with an HTTP 400 whose code is
 * `moderation_blocked` or `content_policy_violation`; other shapes only say so
 * in the message text, hence the text fallback.
 *
 * @param {any} err
 */
export function toImageGenerationError(err) {
	if (err instanceof ImageGenerationError) return err;

	const detail = describeOpenAIError(err);
	const code = String(err?.error?.code ?? err?.code ?? '');
	const status = err?.status ?? err?.response?.status;
	const text = detail.toLowerCase();

	const blockedByCode = [
		'moderation_blocked',
		'content_policy_violation',
		'invalid_prompt'
	].includes(code);
	const blockedByText =
		/safety system|content policy|moderation|not allowed|rejected as a result|violat/.test(text);

	if (blockedByCode || blockedByText) {
		const copyright = /copyright|intellectual property|trademark|likeness/.test(text);
		// Retryable: this filter refuses innocent prompts. A playtest had it
		// reject "The physical form of deja vu, painted in bright colours" with
		// safety_violations=[sexual], and an identical prompt was refused on 1 of
		// 3 tries. Sending it again really is the first thing to do.
		return new ImageGenerationError(
			'prompt_blocked',
			copyright ? REASONS.copyright : REASONS.safety,
			detail,
			true
		);
	}
	if (status === 429 || code === 'rate_limit_exceeded') {
		return new ImageGenerationError('rate_limited', REASONS.rate_limited, detail, true);
	}
	return new ImageGenerationError('error', REASONS.error, detail, true);
}
