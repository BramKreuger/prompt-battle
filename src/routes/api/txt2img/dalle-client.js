import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import { toImageGenerationError } from '$lib/server/openai-error';

// dall-e-2 and dall-e-3 were shut down on 2026-05-12. These models always
// return base64, never a hosted URL.
//
// Benchmarked on 2026-09-10 with the exact settings below, same prompt:
//   gpt-image-2              17.2s   (what this used to be)
//   gpt-image-2.5-flare      12.6s   quality equal or better -> default
//   gpt-image-2.5-sunburst   12.4s   also great, but no faster than flare
//   gpt-image-1-mini          9.1s   fastest, but visibly worse: cartoonish,
//                                    mangled faces, no legible text
// The audience votes on these images, so quality is not tradeable for the last
// two seconds. Override with IMAGE_MODEL if a model misbehaves mid-show.
const DEFAULT_MODEL = 'gpt-image-2.5-flare';
// 'low' quality is dramatically faster than 'high' — this is a live party game,
// so latency beats fidelity. jpeg keeps the base64 payload small enough to
// travel over the socket.io channel (see maxHttpBufferSize in vite.config.js).
// Note: output_format 'webp' is currently ignored by the API, so use jpeg.
const OUTPUT_FORMAT = 'jpeg';

export async function createImage(prompt) {
	if (!env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY missing!');
	if (!prompt) throw Error('Prompt is missing');
	const model = env.IMAGE_MODEL || DEFAULT_MODEL;
	const openai = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
		organization: env.OPENAI_ORG_ID || undefined
	});
	console.log(`...Calling image API (${model})...`);
	try {
		const result = await openai.images.generate({
			model,
			prompt: prompt,
			// Only the first image is ever used, so asking for two just cost a
			// second image and ~5s of extra latency per generation.
			n: 1,
			size: '1024x1024',
			quality: 'low',
			output_format: OUTPUT_FORMAT,
			output_compression: 80
		});
		const b64 = result.data?.[0]?.b64_json;
		if (!b64) throw Error('Image API returned no image data');
		return { url: `data:image/${OUTPUT_FORMAT};base64,${b64}` };
	} catch (err) {
		// Classify here, while the SDK error (status + error.code) is still
		// intact: a prompt the moderation filter refused has to reach the player
		// as retryable, not as a generic 500.
		const failure = toImageGenerationError(err);
		console.error(`Image generation failed (${failure.code}):`, failure.message);
		throw failure;
	}
}
