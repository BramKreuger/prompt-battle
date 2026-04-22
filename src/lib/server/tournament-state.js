import { PROMPT_POOL, totalRounds, difficultyForRound, pickPrompt } from '../prompts.js';

function freshPromptSlot() {
	return {
		text: '',
		difficulty: 'easy',
		typed: { 1: '', 2: '' },
		images: { 1: null, 2: null },
		imageReady: { 1: false, 2: false },
		votes: { 1: 0, 2: 0 },
		votedClients: [],
		winner: null,
		deadlineTs: null
	};
}

function initialState() {
	return {
		status: 'idle',
		config: null,
		bracket: [],
		currentRoundIdx: 0,
		currentMatchIdx: 0,
		currentPrompt: freshPromptSlot(),
		customPrompts: [],
		usedPromptTexts: [],
		champion: null
	};
}

let state = initialState();

function buildBracket(size, players) {
	const rounds = totalRounds(size);
	const bracket = [];
	const shuffled = [...players].sort(() => Math.random() - 0.5);
	const first = [];
	for (let i = 0; i < size; i += 2) {
		first.push({
			p1: shuffled[i],
			p2: shuffled[i + 1],
			scores: { 1: 0, 2: 0 },
			winner: null,
			promptHistory: []
		});
	}
	bracket.push(first);
	for (let r = 1; r < rounds; r++) {
		const matches = [];
		const matchCount = bracket[r - 1].length / 2;
		for (let m = 0; m < matchCount; m++) {
			matches.push({
				p1: null,
				p2: null,
				scores: { 1: 0, 2: 0 },
				winner: null,
				promptHistory: []
			});
		}
		bracket.push(matches);
	}
	return bracket;
}

function currentMatch() {
	if (!state.bracket.length) return null;
	return state.bracket[state.currentRoundIdx]?.[state.currentMatchIdx] || null;
}

function getPool() {
	return {
		easy: [...PROMPT_POOL.easy, ...state.customPrompts.filter((p) => p.tier === 'easy').map((p) => p.text)],
		medium: [...PROMPT_POOL.medium, ...state.customPrompts.filter((p) => p.tier === 'medium').map((p) => p.text)],
		hard: [...PROMPT_POOL.hard, ...state.customPrompts.filter((p) => p.tier === 'hard').map((p) => p.text)]
	};
}

function loadNewPromptForCurrentMatch() {
	if (!state.config) return;
	const rounds = totalRounds(state.config.size);
	const difficulty = difficultyForRound(state.currentRoundIdx, rounds);
	const text = pickPrompt(getPool(), difficulty, state.usedPromptTexts);
	state.currentPrompt = freshPromptSlot();
	state.currentPrompt.text = text;
	state.currentPrompt.difficulty = difficulty;
	const secs = Number(state.config.promptTimerSeconds) || 0;
	state.currentPrompt.deadlineTs = secs > 0 ? Date.now() + secs * 1000 : null;
	state.usedPromptTexts.push(text);
	state.status = 'prompting';
}

function resolveMatchWin(match) {
	const needed = Math.ceil((state.config.promptsPerMatch + 1) / 2);
	if (match.scores[1] >= needed) return 1;
	if (match.scores[2] >= needed) return 2;
	return null;
}

function advanceBracketWinnerForward() {
	const rIdx = state.currentRoundIdx;
	const mIdx = state.currentMatchIdx;
	const match = state.bracket[rIdx][mIdx];
	if (!match || !match.winner) return;
	const winnerName = match.winner === 1 ? match.p1 : match.p2;
	const nextRound = rIdx + 1;
	if (nextRound >= state.bracket.length) return;
	const nextMatchIdx = Math.floor(mIdx / 2);
	const slot = mIdx % 2 === 0 ? 'p1' : 'p2';
	state.bracket[nextRound][nextMatchIdx][slot] = winnerName;
}

function gotoNextMatch() {
	const rounds = state.bracket.length;
	const thisRound = state.bracket[state.currentRoundIdx];
	if (state.currentMatchIdx + 1 < thisRound.length) {
		state.currentMatchIdx += 1;
	} else if (state.currentRoundIdx + 1 < rounds) {
		state.currentRoundIdx += 1;
		state.currentMatchIdx = 0;
	} else {
		const finalMatch = state.bracket[state.bracket.length - 1][0];
		state.champion = finalMatch.winner === 1 ? finalMatch.p1 : finalMatch.p2;
		state.status = 'tournament_complete';
		return;
	}
	state.currentPrompt = freshPromptSlot();
	state.status = 'match_intro';
}

export function getState() {
	return state;
}

export function dispatch(action) {
	if (!action || typeof action !== 'object') return state;
	const { type, payload } = action;

	switch (type) {
		case 'setup': {
			const { size, promptsPerMatch, players, promptTimerSeconds } = payload;
			if (![2, 4, 8, 16].includes(size)) break;
			if (!Array.isArray(players) || players.length !== size) break;
			const timer = Number(promptTimerSeconds);
			state = initialState();
			state.config = {
				size,
				promptsPerMatch,
				players,
				promptTimerSeconds: Number.isFinite(timer) && timer >= 0 ? timer : 120
			};
			state.bracket = buildBracket(size, players);
			state.status = 'configured';
			break;
		}
		case 'startTournament': {
			if (state.status !== 'configured') break;
			state.currentRoundIdx = 0;
			state.currentMatchIdx = 0;
			state.status = 'match_intro';
			break;
		}
		case 'startPrompt': {
			if (!['match_intro', 'revealing'].includes(state.status)) break;
			loadNewPromptForCurrentMatch();
			break;
		}
		case 'setPromptText': {
			if (state.status !== 'prompting') break;
			const t = (payload?.text || '').toString().slice(0, 200);
			state.currentPrompt.text = t;
			break;
		}
		case 'regeneratePrompt': {
			if (state.status !== 'prompting') break;
			const rounds = totalRounds(state.config.size);
			const difficulty = difficultyForRound(state.currentRoundIdx, rounds);
			const prev = state.currentPrompt.text;
			if (prev) {
				const idx = state.usedPromptTexts.lastIndexOf(prev);
				if (idx >= 0) state.usedPromptTexts.splice(idx, 1);
			}
			const text = pickPrompt(getPool(), difficulty, state.usedPromptTexts);
			state.currentPrompt.text = text;
			state.currentPrompt.difficulty = difficulty;
			const secs = Number(state.config.promptTimerSeconds) || 0;
			state.currentPrompt.deadlineTs = secs > 0 ? Date.now() + secs * 1000 : null;
			state.usedPromptTexts.push(text);
			break;
		}
		case 'addCustomPrompt': {
			const t = (payload?.text || '').toString().trim().slice(0, 200);
			const tier = ['easy', 'medium', 'hard'].includes(payload?.tier) ? payload.tier : 'medium';
			if (!t) break;
			state.customPrompts.push({ text: t, tier });
			break;
		}
		case 'typing': {
			if (state.status !== 'prompting') break;
			const pid = payload?.playerId;
			if (pid !== 1 && pid !== 2) break;
			state.currentPrompt.typed[pid] = (payload?.text || '').toString().slice(0, 500);
			break;
		}
		case 'triggerGenerate': {
			if (state.status !== 'prompting') break;
			state.currentPrompt.deadlineTs = null;
			state.status = 'generating';
			break;
		}
		case 'imageReady': {
			if (state.status !== 'generating') break;
			const pid = payload?.playerId;
			if (pid !== 1 && pid !== 2) break;
			state.currentPrompt.images[pid] = payload?.imageUrl || null;
			state.currentPrompt.imageReady[pid] = true;
			if (state.currentPrompt.imageReady[1] && state.currentPrompt.imageReady[2]) {
				state.status = 'voting';
			}
			break;
		}
		case 'vote': {
			if (state.status !== 'voting') break;
			const pid = payload?.choice;
			const cid = payload?.clientId;
			if ((pid !== 1 && pid !== 2) || !cid) break;
			if (state.currentPrompt.votedClients.includes(cid)) break;
			state.currentPrompt.votedClients.push(cid);
			state.currentPrompt.votes[pid] += 1;
			break;
		}
		case 'revealPromptWinner': {
			if (state.status !== 'voting') break;
			const v = state.currentPrompt.votes;
			let winner;
			if (v[1] > v[2]) winner = 1;
			else if (v[2] > v[1]) winner = 2;
			else winner = payload?.tiebreak === 2 ? 2 : 1;
			state.currentPrompt.winner = winner;
			const match = currentMatch();
			if (match) {
				match.scores[winner] += 1;
				match.promptHistory.push({
					text: state.currentPrompt.text,
					difficulty: state.currentPrompt.difficulty,
					typed: { ...state.currentPrompt.typed },
					images: { ...state.currentPrompt.images },
					votes: { ...state.currentPrompt.votes },
					winner
				});
			}
			state.status = 'revealing';
			break;
		}
		case 'nextPromptOrMatch': {
			if (state.status !== 'revealing') break;
			const match = currentMatch();
			if (!match) break;
			const matchWinner = resolveMatchWin(match);
			if (matchWinner) {
				match.winner = matchWinner;
				advanceBracketWinnerForward();
				state.status = 'match_complete';
			} else {
				loadNewPromptForCurrentMatch();
			}
			break;
		}
		case 'nextMatch': {
			if (state.status !== 'match_complete') break;
			gotoNextMatch();
			break;
		}
		case 'resetTournament': {
			state = initialState();
			break;
		}
		default:
			break;
	}
	return state;
}
