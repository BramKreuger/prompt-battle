import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { Server } from 'socket.io';
import { dispatch, getState } from './src/lib/server/tournament-state.js';

process.env.BROWSER = 'firefox';

const webSocketServerPlugin = {
	name: 'sveltekit-socket-io',
	configureServer(server) {
		// gpt-image-* returns base64, so images travel as data URIs rather than
		// short https links. socket.io's default maxHttpBufferSize is 1 MB,
		// which both 'imageReady' and the full 'tournament:state' broadcast
		// (two images at once) would exceed, silently killing the connection.
		const io = new Server(server.httpServer, { maxHttpBufferSize: 1e7 });
		console.log('SocketIO injected');

		let timerHandle = null;
		let scheduledFor = null;

		// The two timed phases: typing ends by itself, and so must generating —
		// an image the API refuses (blocked prompt) never reports back, so
		// without this the tournament would stall in `generating` forever.
		function pendingDeadline(s) {
			if (s?.status === 'prompting') return { phase: 'prompting', ts: s.currentPrompt?.deadlineTs };
			if (s?.status === 'generating')
				return { phase: 'generating', ts: s.currentPrompt?.generateDeadlineTs };
			return { phase: null, ts: null };
		}

		function syncPromptTimer() {
			const { phase, ts: deadline } = pendingDeadline(getState());
			if (deadline !== scheduledFor) {
				if (timerHandle) clearTimeout(timerHandle);
				timerHandle = null;
				scheduledFor = deadline;
				if (deadline) {
					const delay = Math.max(0, deadline - Date.now());
					timerHandle = setTimeout(() => {
						const now = getState();
						const current = pendingDeadline(now);
						// Re-check: the phase may have moved on while we waited.
						if (current.phase !== phase || current.ts !== deadline) return;
						if (phase === 'prompting') {
							dispatch({ type: 'triggerGenerate' });
							io.emit('generate', undefined);
						} else {
							dispatch({ type: 'resolveGeneration' });
						}
						io.emit('tournament:state', getState());
						syncPromptTimer();
					}, delay);
				}
			}
		}

		const broadcast = () => {
			io.emit('tournament:state', getState());
			syncPromptTimer();
		};

		syncPromptTimer();

		io.on('connection', (socket) => {
			socket.emit('tournament:state', getState());

			socket.on('tournament:get', () => {
				socket.emit('tournament:state', getState());
			});

			socket.on('tournament:action', (action) => {
				dispatch(action);
				broadcast();
			});

			socket.on('promptChange', ({ userId, prompt }) => {
				io.emit('promptChange', { userId, prompt });
				const pid = Number(userId);
				if (pid === 1 || pid === 2) {
					dispatch({ type: 'typing', payload: { playerId: pid, text: prompt } });
					broadcast();
				}
			});

			socket.on('imageReady', ({ userId, imageUrl }) => {
				io.emit('imageReady', { userId, imageUrl });
				const pid = Number(userId);
				if (pid === 1 || pid === 2) {
					dispatch({ type: 'imageReady', payload: { playerId: pid, imageUrl } });
					broadcast();
				}
			});

			// A player's generation was refused or failed. Recorded rather than
			// treated as "done", so they can fix the prompt and retry inside the
			// generate window; the window's deadline resolves the phase if not.
			socket.on('imageFailed', ({ userId, code, reason }) => {
				io.emit('imageFailed', { userId, code, reason });
				const pid = Number(userId);
				if (pid === 1 || pid === 2) {
					dispatch({ type: 'generationFailed', payload: { playerId: pid, code, reason } });
					broadcast();
				}
			});

			socket.on('celebrate', ({ userId }) => {
				io.emit('celebrate', userId);
			});

			socket.on('generate', ({ userId }) => {
				io.emit('generate', userId);
				if (!userId) {
					dispatch({ type: 'triggerGenerate' });
					broadcast();
				}
			});

			socket.on('reset', ({ userId }) => {
				io.emit('reset', userId);
			});
		});
	}
};

export default defineConfig({
	plugins: [sveltekit(), webSocketServerPlugin],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
