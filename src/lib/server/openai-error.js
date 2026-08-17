/**
 * Extract a short, safe description from an OpenAI SDK error.
 *
 * Never return or log the raw error object: with the axios-based v3 SDK it
 * carries the full request config, including the `Authorization: Bearer sk-...`
 * header, which is how the live key ended up in the Railway deploy logs.
 *
 * OpenAI's own error text can also echo a partially masked key
 * (`sk-proj-****EKEY`), so scrub anything key-shaped before it reaches a log.
 */
export function describeOpenAIError(err) {
	const detail = err?.response?.data?.error?.message ?? err?.message ?? 'Unknown error';
	return String(detail).replace(/\b(sk|rk)-[A-Za-z0-9_*-]+/g, '[redacted]');
}
