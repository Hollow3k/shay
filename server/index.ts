import 'dotenv/config';
import { createApp } from './src/app';

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
	// eslint-disable-next-line no-console
	console.log(`[server] listening on http://localhost:${port}`);
});

