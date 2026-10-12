import { PrismaClient } from '@prisma/client';
import { AwilixContainer, InjectionMode, asClass, asValue, createContainer } from 'awilix';
import { IActivityDataRepository } from '../../domain/repositories/IActivityDataRepository';
import { IUploadRepository } from '../../domain/repositories/IUploadRepository';
import { PrismaActivityDataRepository } from '../persistence/repositories/PrismaActivityDataRepository';
import { PrismaUploadRepository } from '../persistence/repositories/PrismaUploadRepository';

/** Everything the container can resolve, keyed by constructor parameter name. */
export interface DocumentProcessingCradle {
  prisma: PrismaClient;
  uploadRepository: IUploadRepository;
  activityDataRepository: IActivityDataRepository;
}

/**
 * Composition root of the document-processing context.
 * CLASSIC mode injects dependencies by constructor parameter name, so classes
 * stay framework-agnostic: constructor(private readonly prisma: PrismaClient).
 */
export const createDocumentProcessingContainer = (
  prisma: PrismaClient,
): AwilixContainer<DocumentProcessingCradle> => {
  const container = createContainer<DocumentProcessingCradle>({
    injectionMode: InjectionMode.CLASSIC,
    strict: true,
  });

  container.register({
    prisma: asValue(prisma),
    uploadRepository: asClass(PrismaUploadRepository).singleton(),
    activityDataRepository: asClass(PrismaActivityDataRepository).singleton(),
  });

  return container;
};
