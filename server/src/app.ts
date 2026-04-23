import cors from 'cors';
import express from 'express';
import { aiRoutes } from './routes/aiRoutes';

export const createApp = () => {
	const app = express();

	app.use(cors());
	app.use(express.json({ limit: '2mb' }));

	app.get('/health', (_req, res) => {
		res.status(200).json({ ok: true });
	});

	app.use('/api/ai', aiRoutes);

	app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
		const message = error instanceof Error ? error.message : 'Unknown server error';
		res.status(500).json({ error: message });
	});

	return app;
};

