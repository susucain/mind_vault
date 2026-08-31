import { z } from 'zod';
import { RetrievalHit } from '../../retrieval/retrieval-hit';

export const routeSchema = z.object({
  intent: z.enum(['lookup', 'semantic', 'graph', 'compare']),
  complexity: z.enum(['low', 'medium', 'high']),
  entityNames: z.array(z.string().min(1)).max(10),
});

export type RagRoute = z.infer<typeof routeSchema>;

export interface RagState {
  ownerId: string;
  question: string;
  datasetIds: string[];
  route?: RagRoute;
  hits: RetrievalHit[];
  usedTools: string[];
  answer?: string;
  citedChunkIds: string[];
  confidence: number;
  model?: string;
  thinking: boolean;
}

export const answerSchema = z.object({
  answer: z.string().min(1),
  citedChunkIds: z.array(z.string()).max(8),
  confidence: z.number().min(0).max(1),
});
