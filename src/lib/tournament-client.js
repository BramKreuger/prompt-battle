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
