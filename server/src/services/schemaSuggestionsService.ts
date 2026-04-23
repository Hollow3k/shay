import Groq from 'groq-sdk';

type Column = {
  id: string;
  name: string;
  dataType: 'varchar' | 'int' | 'bigint' | 'bool' | 'date' | 'timestamp' | 'text';
  fieldType: 'none' | 'primary' | 'candidate' | 'unique';
  nullable: boolean;
};

type CanvasPayload = {
  version: number;
  savedAt: string;
  flow: {
    nodes: unknown[];
    edges: unknown[];
  };
  llmSchema: {
    tables: Array<{
      id: string;
      name: string;
      columns: Column[];
      nodePosition: {
        x: number;
        y: number;
      };
    }>;
    relationships: Array<{
      edgeId: string;
      fromTable: string | null;
      toTable: string | null;
      fromNodeId: string;
      toNodeId: string;
      fromHandle?: string | null;
      toHandle?: string | null;
      label?: string | null;
    }>;
    comments: Array<{
      nodeId: string;
      text: string;
      nodePosition: {
        x: number;
        y: number;
      };
    }>;
  };
};

type SchemaPayload = CanvasPayload['llmSchema'];

export type SchemaSuggestionsRequestBody = {
  projectId?: string;
  schema: SchemaPayload;
  canvasData: CanvasPayload;
  userContext?: string;
  sqlDialect?: 'postgresql' | 'mysql' | 'sqlite';
};

export type SchemaSuggestionsResponse = {
  suggestionsText: string;
  suggestedCanvas: CanvasPayload;
};

export type SqlExportResponse = {
  sqlCommands: string;
};

const GROQ_MODEL = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const getErrorDetail = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    if (isRecord(error)) {
      const statusCode = typeof error.statusCode === 'number' ? error.statusCode : null;
      const status = typeof error.status === 'number' ? error.status : null;
      const resolvedStatus = statusCode ?? status;
      const body =
        typeof error.responseBody === 'string'
          ? error.responseBody
          : typeof error.error === 'string'
            ? error.error
            : null;

      if (resolvedStatus && body) {
        return `${error.message} (status ${resolvedStatus}) ${body}`;
      }

      if (resolvedStatus) {
        return `${error.message} (status ${resolvedStatus})`;
      }
    }

    return error.message;
  }

  return 'Unknown model error.';
};

const isCanvasPayload = (value: unknown): value is CanvasPayload => {
  if (!isRecord(value) || !isRecord(value.flow)) {
    return false;
  }

  return Array.isArray(value.flow.nodes) && Array.isArray(value.flow.edges);
};

const extractFirstJsonObject = (text: string): string | null => {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }

  return text.slice(firstBrace, lastBrace + 1);
};

const buildGroqPrompt = (input: SchemaSuggestionsRequestBody): string => {
  const extraContext = input.userContext?.trim() || 'None provided';

  return [
    'You are a senior database architect and schema optimizer.',
    'I will provide:',
    '1) Current schema in JSON',
    '2) Full canvas payload JSON (nodes, edges, schema metadata)',
    '3) Optional product/context notes from the user',
    '',
    'Your tasks:',
    '1) Analyze the schema for normalization issues, indexing opportunities, naming consistency, nullability, key strategy, data type choices, and relationship quality.',
    '2) Produce concise, practical textual suggestions prioritized by impact.',
    '3) Produce a revised canvas payload JSON that applies your recommended changes directly.',
    '',
    'Rules for revised canvas payload:',
    '- Return valid JSON only for the canvas payload output object.',
    '- Preserve existing node ids and edge ids whenever possible.',
    '- Keep node positions unless a structural reason requires movement.',
    '- Preserve comment nodes unless they conflict with correctness.',
    '- Update only what is necessary for optimization and consistency.',
    '- Prefer safe, realistic improvements over aggressive rewrites.',
    '- If no improvements are needed, return the original canvas payload unchanged.',
    '',
    'Output format (strict JSON object):',
    '{',
    '  "suggestionsText": "human-readable recommendations",',
    '  "suggestedCanvas": { /* full canvas payload JSON */ }',
    '}',
    '',
    `Current schema JSON:\n${JSON.stringify(input.schema, null, 2)}`,
    '',
    `Current canvas payload JSON:\n${JSON.stringify(input.canvasData, null, 2)}`,
    '',
    `Extra user context:\n${extraContext}`,
  ].join('\n');
};

const buildSqlExportPrompt = (input: SchemaSuggestionsRequestBody): string => {
  const sqlDialect = input.sqlDialect ?? 'postgresql';

  return [
    'You are an expert SQL database engineer.',
    'Given the schema and canvas payload below, generate SQL commands required to create the schema.',
    '',
    'Requirements:',
    '- Return SQL statements only. Do not include markdown code fences.',
    '- Include CREATE TABLE statements for all tables.',
    '- Include primary keys, unique constraints, and nullability constraints.',
    '- Include foreign key constraints inferred from explicit relationships where possible.',
    '- Use safe, executable SQL in dependency-aware order.',
    `- Target SQL dialect: ${sqlDialect}.`,
    '',
    `Schema JSON:\n${JSON.stringify(input.schema, null, 2)}`,
    '',
    `Canvas payload JSON:\n${JSON.stringify(input.canvasData, null, 2)}`,
  ].join('\n');
};

const extractSqlContent = (text: string): string => {
  const fencedMatch = text.match(/```sql\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return text.trim();
};

const parseModelResponse = (content: string): SchemaSuggestionsResponse => {
  const rawJson = extractFirstJsonObject(content);

  if (!rawJson) {
    throw new Error('Model did not return JSON.');
  }

  const parsed: unknown = JSON.parse(rawJson);

  if (!isRecord(parsed)) {
    throw new Error('Model JSON response is not an object.');
  }

  const suggestionsText =
    typeof parsed.suggestionsText === 'string'
      ? parsed.suggestionsText
      : 'No textual suggestions returned.';

  const suggestedCanvas = parsed.suggestedCanvas;

  if (!isCanvasPayload(suggestedCanvas)) {
    throw new Error('Model response did not include a valid suggestedCanvas payload.');
  }

  return {
    suggestionsText,
    suggestedCanvas,
  };
};

const fallbackResponse = (
  input: SchemaSuggestionsRequestBody,
  reason?: string,
): SchemaSuggestionsResponse => {
  const detail = reason?.trim() ? ` Details: ${reason}` : '';

  return {
    suggestionsText:
      `Groq call failed or is not configured. Returning original canvas unchanged. Configure GROQ_API_KEY in server environment and retry.${detail}`,
    suggestedCanvas: input.canvasData,
  };
};

export const requestSchemaSuggestions = async (
  input: SchemaSuggestionsRequestBody,
): Promise<SchemaSuggestionsResponse> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is missing. Set it in server environment, then retry /api/ai/schema-suggestions.',
    );
  }

  const groq = new Groq({ apiKey });
  const prompt = buildGroqPrompt(input);

  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a strict JSON API. Always return a JSON object with keys suggestionsText and suggestedCanvas.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2,
    });

    const text = completion.choices[0]?.message?.content;

    if (!text || typeof text !== 'string') {
      throw new Error('Groq response content is empty.');
    }

    return parseModelResponse(text);
  } catch (error) {
    return fallbackResponse(input, getErrorDetail(error));
  }
};

export const requestSqlCommands = async (
  input: SchemaSuggestionsRequestBody,
): Promise<SqlExportResponse> => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GROQ_API_KEY is missing. Set it in server environment, then retry /api/ai/export-sql.',
    );
  }

  const groq = new Groq({ apiKey });
  const prompt = buildSqlExportPrompt(input);

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      {
        role: 'system',
        content: 'You output executable SQL only. Do not include explanations.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.1,
  });

  const text = completion.choices[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('Groq SQL export response is empty.');
  }

  const sqlCommands = extractSqlContent(text);
  if (!sqlCommands) {
    throw new Error('Groq SQL export response did not include SQL commands.');
  }

  return { sqlCommands };
};
