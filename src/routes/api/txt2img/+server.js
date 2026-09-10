import { json, error } from '@sveltejs/kit';
import { createImage as sdCreateImage } from './sd-client';
import { createImage as dalleCreateImage } from './dalle-client';
import {
	blockedPromptError,
	emptyPromptError,
	toImageGenerationError
} from '$lib/server/openai-error';
import { prescreenPrompt } from '$lib/server/prompt-guard';

export function GET(params) {
	return new Response(JSON.stringify(params));
}

export async function POST({ request }) {
	const requestJson = await request.json();
	const { prompt } = requestJson;
	const engine = import.meta.env.VITE_IMAGE_ENGINE;

	if (!engine) {
		throw error(500, { message: 'Unknown image generation engine!' });
	}
	let createImage;
	switch (engine) {
		case 'sd':
			createImage = sdCreateImage;
			break;
		case 'dalle':
			createImage = dalleCreateImage;
			break;
		default:
			throw error(500, { message: 'Unknown image generation engine!' });
	}
	// Caught here rather than deeper down, so the player reads "you have not
	// typed anything" instead of a technical failure. Very easy to hit live:
	// the host presses Generate before someone has started.
	if (!prompt || !String(prompt).trim()) {
		const failure = emptyPromptError();
		return json(
			{ code: failure.code, reason: failure.reason, message: failure.reason, retryable: false },
			{ status: 422 }
		);
	}

	try {
		// Ask a fast model first. The image API takes 19-34s to say "rejected by
		// the safety system" and never says why; this answers in about a second
		// and can name the character. Advisory only — it returns null on any
		// trouble, and only 'dalle' has a filter worth pre-empting.
		if (engine === 'dalle') {
			const screened = await prescreenPrompt(prompt);
			if (screened) {
				const failure = blockedPromptError(screened);
				console.log('txt2img pre-screened:', failure.message);
				return json(
					{
						code: failure.code,
						reason: failure.reason,
						message: failure.reason,
						retryable: failure.retryable
					},
					{ status: 422 }
				);
			}
		}
		const res = await createImage(prompt);
		return json(res); //TODO: Add types! {url: 'my-url.png'}
	} catch (err) {
		const failure = toImageGenerationError(err);
		// Log the redacted message only — a raw axios/SDK error would include the
		// Authorization header, i.e. the API key, in plaintext. Only the authored
		// `reason` goes to the browser; upstream error text stays server-side,
		// since this endpoint is unauthenticated.
		console.error(`txt2img failed (${failure.code}):`, failure.message);
		return json(
			{
				code: failure.code,
				reason: failure.reason,
				message: failure.reason,
				retryable: failure.retryable
			},
			// 422: the request was fine, the prompt was refused. The player screen
			// keys off `code` to offer a retry instead of a dead end.
			{ status: failure.code === 'prompt_blocked' ? 422 : 502 }
		);
	}
}
