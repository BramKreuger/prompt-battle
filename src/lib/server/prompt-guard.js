import OpenAI from 'openai';
import { env } from '$env/dynamic/private';
import { describeOpenAIError } from './openai-error.js';

// Measured: the image API takes 19-34s to answer "rejected by the safety
// system" for a prompt like "scrooge mcduck riding a bicycle" — as long as a
// real generation. That is far too slow to tell a player on stage to try
// something else, and it tells us nothing about *why*. A small chat model
// answers the same question in about a second and can name the character.
//
// Calibrated against gpt-image-2 (2026-09-09): it refuses copyrighted
// fictional characters (Scrooge McDuck, Mickey Mouse, Darth Vader, Superman)
// but happily draws brand logos and real public figures, named or not — so the
// screen must not block those, or it would veto legitimate hard-tier prompts
// like "the current U.S. president" straight out of the game's own pool.
//
// Artist styles are deliberately NOT screened: the filter keeps a per-artist
// list we cannot predict ("in the style of salvador dali" is refused, van gogh
// and picasso are not). Guessing there would wrongly veto legal prompts, which
// is worse than the slow path — those fall through to the image API, and the
// `safety` reason in openai-error.js names the artist case explicitly.
const MODEL = 'gpt-4o-mini';
// Never let the guard become the slow part: if it has not answered by now, let
// the image API be the judge instead. Normal answers land in 0.6-1.4s, but 3s
// was tight enough to trip on a slow call during a playtest, which sent a
// named character down the 20s path with the vaguer message. 5s still bounds
// the wait and only elapses when the call is genuinely hanging.
const TIMEOUT_MS = 5000;

const SYSTEM = `You screen prompts for a live text-to-image party game before they reach OpenAI's image API.
Block ONLY these two things:
1. "copyright" — any mention by name of a copyrighted fictional character, whatever the character is doing: Scrooge McDuck, Mickey Mouse, Darth Vader, Superman, Mario, Pikachu, Elsa, Batman, Shrek, SpongeBob, and the like.
2. "unsafe" — sexual content, graphic gore, or hateful imagery.

Do NOT block anything else. These are all fine and must pass:
- Real people, named or described: "Mark Rutte on a scooter", "the current US president", "a famous singer".
- Brands, logos and products: "the Nike swoosh on a wall", "a Coca-Cola bottle".
- Generic descriptions that merely resemble a character, as long as no name is mentioned: "a rich duck with a top hat and a monocle", "a plumber in red overalls jumping over a turtle".
- Abstract, weird or mundane scenes: "capitalism as a person", "a typical Monday morning".

Answer with JSON only: {"blocked": boolean, "kind": "copyright" | "unsafe" | null, "subject": string | null}
"subject" is the offending character's proper name (e.g. "Scrooge McDuck"), or a short 2-4 word description for unsafe content; null when nothing is wrong.
Working around a character with your own words is the whole skill of this game — reward it, never block it. Only set blocked=true when you are confident the image API would refuse.`;

/**
 * Ask a fast model whether the image API is going to refuse this prompt.
 *
 * Advisory only: any failure here (no key, error, timeout, unparseable answer)
 * returns null so the prompt still goes to the image API. The guard must never
 * be the reason a round cannot be played.
 *
 * @returns {Promise<{ kind: 'copyright' | 'unsafe', subject: string | null } | null>}
 */
export async function prescreenPrompt(prompt) {
	// Kill switch: if the screen ever starts refusing prompts it should not,
	// set PROMPT_PRESCREEN=off and every prompt goes straight to the image API
	// again — the slow path, but never a wrong veto.
	if (env.PROMPT_PRESCREEN === 'off') return null;
	if (!env.OPENAI_API_KEY || !prompt) return null;
	const openai = new OpenAI({
		apiKey: env.OPENAI_API_KEY,
		organization: env.OPENAI_ORG_ID || undefined,
		maxRetries: 0
	});
	try {
		const res = await openai.chat.completions.create(
			{
				model: MODEL,
				messages: [
					{ role: 'system', content: SYSTEM },
					{ role: 'user', content: prompt }
				],
				temperature: 0,
				max_tokens: 60,
				response_format: { type: 'json_object' }
			},
			{ timeout: TIMEOUT_MS }
		);
		const parsed = JSON.parse(res.choices?.[0]?.message?.content || '{}');
		if (!parsed.blocked) return null;
		const kind = parsed.kind === 'unsafe' ? 'unsafe' : 'copyright';
		const subject =
			typeof parsed.subject === 'string' && parsed.subject.trim()
				? parsed.subject.trim().slice(0, 60)
				: null;
		return { kind, subject };
	} catch (err) {
		// Log and wave it through — the image API's own filter is the backstop.
		console.warn('Prompt pre-screen skipped:', describeOpenAIError(err));
		return null;
	}
}
