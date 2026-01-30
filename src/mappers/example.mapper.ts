import { Example } from '../models/example.schema';
import {
  CreateExampleInput,
  UpdateExampleInput,
} from '../schemas/example.schema';

/**
 * Converts an Example Drizzle object to a plain JavaScript object (DTO)
 * that is safe to send to the client.
 *
 * @param example The Drizzle object to convert.
 * @returns A plain JavaScript object representing the example.
 */
export const toExampleDto = (example: Example) => {
  return {
    id: example.id.toString(),
    name: example.name,
    description: example.description,
    tags: example.tags,
    price: example.price,
    metadata: {
      category: example.metadata?.category,
      priority: example.metadata?.priority,
      createdAt: example.metadata?.createdAt,
    },
    createdAt: example.createdAt,
    updatedAt: example.updatedAt,
  };
};

// toExample and toExampleUpdate are less relevant with Drizzle's direct insert/update
// but keeping them if logic separation is desired, though they need to return Drizzle-friendly objects.
// For now, removing them as the repository handles the mapping directly in the new implementation.

