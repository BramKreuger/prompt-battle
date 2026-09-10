import { writable } from 'svelte/store';
import { io } from 'socket.io-client';

/** @type {import('svelte/store').Writable<any>} */
export const tournamentState = writable(null);

/** @type {any} */
let socket;

export function getSocket() {
	if (!socket) {
		socket = io();
		socket.on('tournament:state', (s) => tournamentState.set(s));

		// Two high-frequency updates arrive as patches rather than whole states,
		// because the full state carries the current prompt's images: one per
		// keystroke while players type, and one per audience vote.
		socket.on('tournament:typing', ({ playerId, text }) => {
			tournamentState.update((s) => {
				if (!s?.currentPrompt?.typed) return s;
				return {
					...s,
					currentPrompt: {
						...s.currentPrompt,
						typed: { ...s.currentPrompt.typed, [playerId]: text }
					}
				};
			});
		});

		socket.on('tournament:votes', ({ votes, votedClients }) => {
			tournamentState.update((s) => {
				if (!s?.currentPrompt) return s;
				return { ...s, currentPrompt: { ...s.currentPrompt, votes, votedClients } };
			});
		});

		socket.emit('tournament:get');
	}
	return socket;
}

export function sendAction(type, payload) {
	getSocket().emit('tournament:action', { type, payload });
}

export function getOrCreateClientId() {
	if (typeof localStorage === 'undefined') return 'server';
	let id = localStorage.getItem('pb:clientId');
	if (!id) {
		id = 'c_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
		localStorage.setItem('pb:clientId', id);
	}
	return id;
}
