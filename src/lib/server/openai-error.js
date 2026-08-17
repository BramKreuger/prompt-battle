/**
 * Extract a short, safe description from an OpenAI SDK error.
 *
 * Never return or log the raw error object: it carries the request context,
 * including the `Authorization: Bearer sk-...` header, which is how the live
 * key ended up in the Railway deploy logs.
 *
 * OpenAI's own error text can also echo a partially masked key
 * (`sk-proj-****EKEY`), so scrub anything key-shaped before it reaches a log.
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
