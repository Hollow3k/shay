import { Router } from 'express';
import { importDatabaseSchema, type DatabaseImportRequestBody } from '../services/databaseImportService';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const hasValidImportBody = (value: unknown): value is DatabaseImportRequestBody => {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.connectionString === 'string' && typeof value.dialect === 'string';
};

export const importRoutes = Router();

importRoutes.post('/schema', async (req, res) => {
  if (!hasValidImportBody(req.body)) {
    res.status(400).json({
      error: 'Invalid body. Expected { connectionString: string, dialect: "postgresql" | "mysql" | "sqlite", schema?: string, projectId?: string }',
    });
    return;
  }

  try {
    const result = await importDatabaseSchema(req.body);
    res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import database schema.';
    const status =
      message.includes('Unsupported database dialect') ||
      message.includes('Only PostgreSQL connection strings') ||
      message.includes('Invalid connection string')
        ? 400
        : message.includes('password authentication failed') || message.includes('ECONNREFUSED')
          ? 502
          : 500;

    res.status(status).json({ error: message });
  }
});