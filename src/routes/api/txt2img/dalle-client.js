import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import { describeOpenAIError } from '$lib/server/openai-error';

// dall-e-2 and dall-e-3 were shut down on 2026-05-12. gpt-image-2 is the
// current image model. It always returns base64, never a hosted URL.
const MODEL = 'gpt-image-2';
// 'low' quality is dramatically faster than 'high' — this is a live party game,
// so latency beats fidelity. jpeg keeps the base64 payload small enough to
// travel over the socket.io channel (see maxHttpBufferSize in vite.config.js).
// Note: output_format 'webp' is currently ignored by the API, so use jpeg.
const OUTPUT_FORMAT = 'jpeg';

export async function createImage(prompt) {
	if (!env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY missing!');
	if (!prompt) throw Error('Prompt is missing');
	const openai = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
		organization: env.OPENAI_ORG_ID || undefined
	});
	console.log(`...Calling image API (${MODEL})...`);
	try {
		const result = await openai.images.generate({
			model: MODEL,
			prompt: prompt,
			n: 2,
			size: '1024x1024',
			quality: 'low',
			output_format: OUTPUT_FORMAT,
			output_compression: 80
		});
		const b64 = result.data?.[0]?.b64_json;
		if (!b64) throw Error('Image API returned no image data');
		return { url: `data:image/${OUTPUT_FORMAT};base64,${b64}` };
	} catch (err) {
		const detail = describeOpenAIError(err);
		console.error('Image generation failed:', detail);
		throw new Error(detail);
	}
}
