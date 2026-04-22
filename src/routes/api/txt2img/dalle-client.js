import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/private';

export async function createImage(prompt) {
	console.log('****** Prompt******: ', prompt);
	if (!env.OPENAI_API_KEY) throw Error('OPENAI_API_KEY missing!');
	if (!prompt) throw Error('Prompt is missing');
	const configuration = new Configuration({
		organization: env.OPENAI_ORG_ID,
		apiKey: env.OPENAI_API_KEY
	});
	const openai = new OpenAIApi(configuration);
	console.log('...Calling Dalle API...');
	const response = await openai.createImage({
		prompt: prompt,
		n: 2,
		size: '1024x1024'
	});
	const imageUrlPublic = response.data.data[0].url;
	return { url: imageUrlPublic };
}
