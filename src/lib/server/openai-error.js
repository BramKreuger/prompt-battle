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
	safety:
		'Deze prompt komt niet door het contentfilter van OpenAI — dat gebeurt vaak bij bekende figuren uit films of games. Probeer iets anders!',
	unsafe:
		'Deze prompt komt niet door het contentfilter van OpenAI. Probeer iets anders — houd het een beetje onschuldig!',
	rate_limited: 'De beeld-API zit even vol. Probeer het direct nog een keer!',
	error: 'Er ging technisch iets mis bij het genereren. Probeer het nog een keer!'
};

/**
 * An image generation failure, already split into what the player may see
 * (`reason`) and what only the server log may see (`message`).
 */
export class ImageGenerationError extends Error {
	/**
	 * @param {'prompt_blocked' | 'rate_limited' | 'error'} code
	 * @param {string} reason  player-facing, a complete sentence
	 * @param {string} detail  server-only, already redacted
	 */
	constructor(code, reason, detail) {
		super(detail);
		this.name = 'ImageGenerationError';
		this.code = code;
		this.reason = reason;
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
	return new ImageGenerationError(
		'prompt_blocked',
		reason,
		`pre-screened as ${screened.kind}: ${screened.subject || 'unnamed'}`
	);
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
		return new ImageGenerationError(
			'prompt_blocked',
			copyright ? REASONS.copyright : REASONS.safety,
			detail
		);
	}
	if (status === 429 || code === 'rate_limit_exceeded') {
		return new ImageGenerationError('rate_limited', REASONS.rate_limited, detail);
	}
	return new ImageGenerationError('error', REASONS.error, detail);
}
