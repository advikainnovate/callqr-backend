import { eq, and, desc, sql, like, or } from 'drizzle-orm';
import { db } from '../db';
import { examples, NewExample } from '../models/example.schema';
import { logger } from '../utils';
import {
  CreateExampleInput,
  UpdateExampleInput,
} from '../schemas/example.schema';

export interface ExampleFilter {
  'metadata.category'?: string;
  isDeleted?: boolean;
}

export const create = async (
  exampleData: CreateExampleInput
): Promise<typeof examples.$inferSelect> => {
  try {
    logger.info('Creating new example item in repository', {
      name: exampleData.name,
    });

    const newExample: NewExample = {
      name: exampleData.name,
      description: exampleData.description,
      price: exampleData.price,
      tags: exampleData.tags,
      metadata: {
        category: exampleData.metadata.category,
        priority: exampleData.metadata.priority || 'medium', // Default to medium if undefined
        createdAt: new Date().toISOString(),
      },
    };

    const [savedExample] = await db.insert(examples).values(newExample).returning();

    logger.info('Example item created successfully in repository', {
      exampleId: savedExample.id,
    });
    return savedExample;
  } catch (error) {
    logger.error('Error creating example item in repository:', error);
    throw error;
  }
};

export const find = async (
  page: number = 1,
  limit: number = 10,
  category?: string,
  isDeleted?: boolean
): Promise<{
  examples: (typeof examples.$inferSelect)[];
  total: number;
}> => {
  try {
    const offset = (page - 1) * limit;

    const conditions = [];
    if (category) {
        // JSONB query for category
        conditions.push(sql`${examples.metadata}->>'category' = ${category}`);
    }
    if (isDeleted !== undefined) conditions.push(eq(examples.isDeleted, isDeleted));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [resultExamples, totalResult] = await Promise.all([
      db
        .select()
        .from(examples)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(examples.createdAt)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(examples)
        .where(whereClause),
    ]);

    const total = Number(totalResult[0]?.count || 0);

    logger.info('Example items retrieved successfully from repository', {
      count: resultExamples.length,
      page,
      limit,
    });
    return { examples: resultExamples, total };
  } catch (error) {
    logger.error('Error retrieving example items from repository:', error);
    throw error;
  }
};

export const findById = async (
  exampleId: string
): Promise<typeof examples.$inferSelect | null> => {
  try {
    const id = parseInt(exampleId);
    if (isNaN(id)) return null;

    const [example] = await db
      .select()
      .from(examples)
      .where(eq(examples.id, id));

    if (!example) {
      logger.warn('Example item not found in repository', { exampleId });
      return null;
    }

    logger.info('Example item retrieved successfully from repository', {
      exampleId,
    });
    return example;
  } catch (error) {
    logger.error('Error retrieving example item from repository:', error);
    throw error;
  }
};

export const update = async (
  exampleId: string,
  updateData: UpdateExampleInput
): Promise<typeof examples.$inferSelect | null> => {
  try {
    const id = parseInt(exampleId);
    if (isNaN(id)) return null;

    // Construct update object - handling partial updates might need more logic depending on requirements
    // For now, assuming we map fields directly.
    const updateValues: Partial<NewExample> = {};
    if (updateData.name) updateValues.name = updateData.name;
    if (updateData.description) updateValues.description = updateData.description;
    if (updateData.price) updateValues.price = updateData.price;
    if (updateData.tags) updateValues.tags = updateData.tags;
    // Metadata update is tricky with partials in JSONB, might need to fetch and merge or use specific JSONB operators.
    // Simulating a merge for metadata if provided
    if (updateData.metadata) {
         // This is a simplification. In a real app, you might want to merge with existing metadata
         // or use jsonb_set. Drizzle support for jsonb_set is via sql operator.
         // For this template, we'll assume full metadata replacement or careful handling.
         // Let's just set it for now if provided.
         updateValues.metadata = {
            category: updateData.metadata.category || 'other', // Default or handle undefined
            priority: updateData.metadata.priority || 'medium',
            createdAt: new Date().toISOString(), // Or keep original?
         };
    }
    updateValues.updatedAt = new Date();


    const [example] = await db
      .update(examples)
      .set(updateValues)
      .where(eq(examples.id, id))
      .returning();

    if (!example) {
      logger.warn('Example item not found for update in repository', {
        exampleId,
      });
      return null;
    }

    logger.info('Example item updated successfully in repository', {
      exampleId,
    });
    return example;
  } catch (error) {
    logger.error('Error updating example item in repository:', error);
    throw error;
  }
};

export const softDelete = async (exampleId: string): Promise<boolean> => {
  try {
    const id = parseInt(exampleId);
    if (isNaN(id)) return false;

    const [example] = await db
      .update(examples)
      .set({ isDeleted: true })
      .where(eq(examples.id, id))
      .returning();

    if (!example) {
      logger.warn('Example item not found for deletion in repository', {
        exampleId,
      });
      return false;
    }

    logger.info('Example item deleted successfully in repository', {
      exampleId,
    });
    return true;
  } catch (error) {
    logger.error('Error deleting example item in repository:', error);
    throw error;
  }
};

export const findByCategory = async (
  category: string
): Promise<typeof examples.$inferSelect[]> => {
  try {
    const resultExamples = await db
      .select()
      .from(examples)
      .where(and(
          sql`${examples.metadata}->>'category' = ${category}`,
          eq(examples.isDeleted, false)
      ))
      .orderBy(desc(examples.createdAt));

    logger.info('Examples retrieved by category from repository', {
      category,
      count: resultExamples.length,
    });
    return resultExamples;
  } catch (error) {
    logger.error(
      'Error retrieving examples by category from repository:',
      error
    );
    throw error;
  }
};

export const search = async (
  searchTerm: string
): Promise<typeof examples.$inferSelect[]> => {
  try {
    const resultExamples = await db
      .select()
      .from(examples)
      .where(and(
          or(
              like(examples.name, `%${searchTerm}%`),
              like(examples.description, `%${searchTerm}%`)
          ),
          eq(examples.isDeleted, false)
      ))
      .orderBy(desc(examples.createdAt));

    logger.info('Examples searched successfully in repository', {
      searchTerm,
      count: resultExamples.length,
    });
    return resultExamples;
  } catch (error) {
    logger.error('Error searching examples in repository:', error);
    throw error;
  }
};

