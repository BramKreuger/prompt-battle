import { json, error } from '@sveltejs/kit';
import { createImage as sdCreateImage } from './sd-client';
import { createImage as dalleCreateImage } from './dalle-client';

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
	try {
		const res = await createImage(prompt);
		return json(res); //TODO: Add types! {url: 'my-url.png'}
	} catch (err) {
		// Log the message only — a raw axios error would include the
		// Authorization header, i.e. the API key, in plaintext. The detail stays
		// server-side: this endpoint is unauthenticated, so upstream API errors
		// should not be echoed back to the browser.
		console.error('txt2img failed:', err.message);
		throw error(500, { message: 'There was a problem accessing the image generation API' });
	}
}
