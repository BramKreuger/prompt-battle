export const PROMPT_POOL = {
	easy: [
		'Your opponent on vacation',
		'A cat running a company',
		'A dog driving a sports car',
		'A robot trying to cook pasta',
		'A snowman on a tropical beach',
		'A pirate lost in space',
		'A ninja teaching yoga',
		'A banana in a tuxedo',
		'A dinosaur at a tea party',
		'Grandma at a rock concert',
		'A knight eating fast food',
		'An alien riding a bicycle',
		'A superhero doing laundry',
		'A wizard stuck in traffic',
		'A shark on a skateboard',
		'A cowboy in a nightclub',
		'A penguin as a professor',
		'A bear running a café',
		'A frog working in an office',
		'A chicken DJ at a rave'
	],
	medium: [
		'A pizza without writing pizza',
		'A typical Monday morning',
		'Your office job, no office visible',
		'The most awkward family photo',
		'Your opponent’s biggest fear',
		'Pure existential dread',
		'The smell of rain',
		'Nostalgia for the 2000s',
		'A memory that never happened',
		'The feeling of being late',
		'Your opponent as a cartoon villain',
		'Your childhood bedroom',
		'That one weird dream',
		'The last day of summer',
		'A cozy Sunday afternoon',
		'The feeling of Friday at 5pm',
		'A city that does not exist',
		'Your opponent at age 80',
		'A chaotic school cafeteria',
		'The mood of November'
	],
	hard: [
		'The current U.S. president (no names)',
		'Your academic degree, no naming it',
		'Capitalism as a person',
		'Too many browser tabs',
		'The internet as a physical place',
		'A dream you can’t remember',
		'Your opponent’s secret alter ego',
		'Time, confused',
		'The sound of silence',
		'A famous painting, but wrong',
		'The last thought before sleep',
		'Your inner child screaming',
		'The weight of unread emails',
		'A feeling with no name',
		'The inside of a very tired brain',
		'Loneliness on a Tuesday',
		'The year 2009, visualized',
		'An emotion banned from society',
		'A country that only exists online',
		'The physical form of déjà vu'
	]
};

export function totalRounds(size) {
	return Math.log2(size);
}

export function difficultyForRound(roundIdx, totalRoundsCount) {
	const fromFinal = totalRoundsCount - 1 - roundIdx;
	if (fromFinal === 0) return 'hard';
	if (fromFinal === 1) return 'medium';
	return 'easy';
}

export function pickPrompt(pool, difficulty, used) {
	const usedSet = new Set(used);
	const tiers = ['hard', 'medium', 'easy'];
	const order = [difficulty, ...tiers.filter((t) => t !== difficulty)];
	for (const tier of order) {
		const candidates = (pool[tier] || []).filter((p) => !usedSet.has(p));
		if (candidates.length) {
			return candidates[Math.floor(Math.random() * candidates.length)];
		}
	}
	const all = [...pool.easy, ...pool.medium, ...pool.hard];
	return all[Math.floor(Math.random() * all.length)];
}
