import { env } from '$env/dynamic/private';

const WIDTH = 512;
const HEIGHT = 512;

function createRequestBody(prompt, width, height) {
	return {
		data: [
			null,
			prompt,
			'',
			[],
			20,
			'Euler a',
			false,
			false,
			1,
			1,
			1, //CGI
			-1,
			-1,
			0,
			0,
			0,
			false,
			height,
			width,
			false,
			0.7,
			2,
			'Latent',
			0,
			0,
			0,
			'None',
			false,
			false,
			false,
			false,
			'',
			'Seed',
			'',
			'Nothing',
			'',
			true,
			false,
			false,
			[],
			'',
			'',
			''
		],
		fn_index: '70'
	};
}

export async function createImage(prompt) {
	if (!env.SD_API_URL) throw Error('env.SD_API_URL missing!');
	const bodyContent = createRequestBody(prompt, WIDTH, HEIGHT);
	const response = await fetch(`${env.SD_API_URL}/run/predict/`, {
		credentials: 'omit',
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:108.0) Gecko/20100101 Firefox/108.0',
			Accept: '*/*',
			'Accept-Language': 'de,en-US;q=0.7,en;q=0.3',
			'Content-Type': 'application/json',
			'Sec-Fetch-Dest': 'empty',
			'Sec-Fetch-Mode': 'cors',
			'Sec-Fetch-Site': 'same-origin'
		},
		referrer: env.SD_API_URL,
		body: JSON.stringify(bodyContent),
		method: 'POST',
		mode: 'cors'
	});
	if (!response.ok) {
		if (response.status === 404) {
			throw Error(`Gradio: No interface is running right now`);
		}
		try {
			const responseJson = await response.json();
			console.log(responseJson);
			const errorMessage = JSON.stringify(responseJson);
			console.log(
				`SD API response was not ok. Maybe automatic111 has changed the interface? SD API says: ${errorMessage}`
			);
			throw Error(`SD API Response: ${errorMessage}`);
		} catch (error) {
			throw Error(`SD API Response: ${error}`);
		}
	}

	const responseJson = await response.json();
	console.log(responseJson);
	const imageUrlLocal = responseJson.data[0][0].name;
	const imageUrlPublic = `${env.SD_API_URL}/file=${imageUrlLocal}`;
	return { url: imageUrlPublic };
}
