import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import { Server } from 'socket.io';
import { dispatch, getState } from './src/lib/server/tournament-state.js';

process.env.BROWSER = 'firefox';

const webSocketServerPlugin = {
	name: 'sveltekit-socket-io',
	configureServer(server) {
		const io = new Server(server.httpServer);
		console.log('SocketIO injected');

		let timerHandle = null;
		let scheduledFor = null;

		function syncPromptTimer() {
			const s = getState();
			const deadline = s?.status === 'prompting' ? s.currentPrompt?.deadlineTs : null;
			if (deadline !== scheduledFor) {
				if (timerHandle) clearTimeout(timerHandle);
				timerHandle = null;
				scheduledFor = deadline;
				if (deadline) {
					const delay = Math.max(0, deadline - Date.now());
					timerHandle = setTimeout(() => {
						const now = getState();
						if (now?.status === 'prompting' && now.currentPrompt?.deadlineTs === deadline) {
							dispatch({ type: 'triggerGenerate' });
							io.emit('generate', undefined);
							io.emit('tournament:state', getState());
							syncPromptTimer();
						}
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
