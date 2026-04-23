import { Router } from 'express';
import {
  requestSqlCommands,
  requestSchemaSuggestions,
  type SchemaSuggestionsRequestBody,
} from '../services/schemaSuggestionsService';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const hasValidSchemaBody = (value: unknown): value is SchemaSuggestionsRequestBody => {
  if (!isRecord(value)) {
    return false;
  }

  const hasSchema = isRecord(value.schema);
  const hasCanvasData = isRecord(value.canvasData);

  return hasSchema && hasCanvasData;
};

export const aiRoutes = Router();

aiRoutes.post('/schema-suggestions', async (req, res) => {
  if (!hasValidSchemaBody(req.body)) {
    res.status(400).json({
      error: 'Invalid body. Expected { schema: object, canvasData: object, userContext?: string, projectId?: string }',
    });
    return;
  }

  try {
    const result = await requestSchemaSuggestions(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate suggestions.';
    const status = message.includes('GROQ_API_KEY') ? 501 : 500;

    res.status(status).json({ error: message });
  }
});

aiRoutes.post('/export-sql', async (req, res) => {
  if (!hasValidSchemaBody(req.body)) {
    res.status(400).json({
      error: 'Invalid body. Expected { schema: object, canvasData: object, userContext?: string, projectId?: string }',
    });
    return;
  }

  try {
    const result = await requestSqlCommands(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to export SQL commands.';
    const status = message.includes('GROQ_API_KEY') ? 501 : 500;

    res.status(status).json({ error: message });
  }
});
