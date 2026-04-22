import { json, error } from '@sveltejs/kit';
import { Configuration, OpenAIApi } from 'openai';
import { env } from '$env/dynamic/private';

const TIER_GUIDANCE = {
	easy: 'playful and concrete — absurd mashups like "a dog driving a car" or "a pirate in space"',
	medium: 'abstract and playful — scenes or feelings that are recognizable but tricky to draw, like "a typical Monday morning" or "your childhood bedroom"',
	hard: 'conceptual, intentionally difficult to render without naming the thing — e.g. "the current U.S. president (no names)", "capitalism as a person", "the internet as a place"'
};

export async function POST({ request }) {
	if (!env.OPENAI_API_KEY) throw error(500, { message: 'OPENAI_API_KEY missing' });
	const body = await request.json();
	const count = Math.max(1, Math.min(10, Number(body?.count) || 5));
	const tier = ['easy', 'medium', 'hard'].includes(body?.tier) ? body.tier : 'medium';

	const configuration = new Configuration({
		organization: env.OPENAI_ORG_ID,
		apiKey: env.OPENAI_API_KEY
	});
	const openai = new OpenAIApi(configuration);

	const systemMsg = `You generate short funny prompt-battle challenges for a live text-to-image game. Each prompt must:
- be at most 8 words
- lead to funny, unexpected, or absurd images
- NOT contain quotes or numbering
- be in English
- be ${TIER_GUIDANCE[tier]}
Return a plain JSON array of ${count} strings, nothing else.`;

	try {
		const res = await openai.createChatCompletion({
			model: 'gpt-4o-mini',
			messages: [
				{ role: 'system', content: systemMsg },
				{ role: 'user', content: `Give me ${count} new ${tier}-tier prompts.` }
			],
			temperature: 1.0
		});
		const text = res.data.choices?.[0]?.message?.content?.trim() || '[]';
		const jsonStart = text.indexOf('[');
		const jsonEnd = text.lastIndexOf(']');
		const raw = jsonStart >= 0 && jsonEnd > jsonStart ? text.slice(jsonStart, jsonEnd + 1) : '[]';
		let prompts = [];
		try {
			prompts = JSON.parse(raw);
		} catch {
			prompts = text
				.split('\n')
				.map((l) => l.replace(/^[-*\d.\s"']+|["']+$/g, '').trim())
				.filter(Boolean);
		}
		prompts = prompts
			.map((p) => (typeof p === 'string' ? p.trim() : ''))
			.filter((p) => p.length > 0 && p.length <= 120)
			.slice(0, count);
		return json({ prompts });
	} catch (err) {
		console.log('AI prompt generation error', err);
		throw error(500, { message: 'AI prompt generation failed' });
	}
}
