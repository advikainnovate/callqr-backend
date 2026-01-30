import { Example } from '../models/example.schema';
import * as exampleRepository from '../repositories/example.repository';
import {
  CreateExampleInput,
  UpdateExampleInput,
} from '../schemas/example.schema';
import { NotFoundError, BadRequestError } from '../utils/ApiError';
import { error as errorMessages } from '../constants/messages';

/**
 * Create a new example item
 */
export const createExample = async (
  exampleData: CreateExampleInput
): Promise<Example> => {
  return exampleRepository.create(exampleData);
};

/**
 * Get all example items with pagination and filtering
 */
export const getExamples = async (
  page: number = 1,
  limit: number = 10,
  category?: string,
  isDeleted?: boolean
): Promise<{
  examples: Example[];
  total: number;
}> => {
  return exampleRepository.find(page, limit, category, isDeleted);
};

/**
 * Get example item by ID
 */
export const getExampleById = async (
  exampleId: string
): Promise<Example> => {
  // Basic integer check for ID if using serial IDs
  if (isNaN(Number(exampleId))) {
     throw new BadRequestError(errorMessages.INVALID_ID('Example'));
  }
  const example = await exampleRepository.findById(exampleId);
  if (!example) {
    throw new NotFoundError(errorMessages.NOT_FOUND('Example'));
  }
  return example;
};

/**
 * Update example item
 */
export const updateExample = async (
  exampleId: string,
  updateData: UpdateExampleInput
): Promise<Example> => {
  if (isNaN(Number(exampleId))) {
    throw new BadRequestError(errorMessages.INVALID_ID('Example'));
  }
  const example = await exampleRepository.update(exampleId, updateData);
  if (!example) {
    throw new NotFoundError(errorMessages.NOT_FOUND('Example'));
  }
  return example;
};

/**
 * Delete example item (soft delete)
 */
export const deleteExample = async (exampleId: string): Promise<boolean> => {
  if (isNaN(Number(exampleId))) {
    throw new BadRequestError(errorMessages.INVALID_ID('Example'));
  }
  const success = await exampleRepository.softDelete(exampleId);
  if (!success) {
    throw new NotFoundError(errorMessages.NOT_FOUND('Example'));
  }
  return true;
};

/**
 * Get examples by category
 */
export const getExamplesByCategory = async (
  category: string
): Promise<Example[]> => {
  return exampleRepository.findByCategory(category);
};

/**
 * Search examples by name or description
 */
export const searchExamples = async (
  searchTerm: string
): Promise<Example[]> => {
  return exampleRepository.search(searchTerm);
};

