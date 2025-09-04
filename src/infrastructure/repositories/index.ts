import { StorageRepository } from '../../domain/repositories/storage.repository';
import { createR2StorageRepository } from './r2Storage.repository';
import { createFileStorageRepository } from './fileStorage.repository';

/**
 * Repository Factory - 根據環境配置創建適當的儲存 Repository
 */

export type RepositoryStorageType = 'r2' | 'file';

/**
 * 根據儲存類型創建對應的 StorageRepository
 */
export const createStorageRepository = (
  type?: RepositoryStorageType,
  options?: {
    bucketName?: string;
    baseDir?: string;
  }
): StorageRepository => {
  const storageType = type || (process.env.STORAGE_TYPE as RepositoryStorageType) || 'file';
  
  switch (storageType) {
    case 'r2':
      console.log('Using R2 Storage Repository');
      return createR2StorageRepository(options?.bucketName);
    
    case 'file':
    default:
      console.log('Using File Storage Repository');
      return createFileStorageRepository(options?.baseDir);
  }
};

/**
 * 預設的儲存 Repository 實例
 * 可透過環境變數 STORAGE_TYPE 控制 (r2 | file)
 */
export const defaultStorageRepository = createStorageRepository();

// 匯出所有 Repository 類型
export { StorageRepository };
export { R2StorageRepository, createR2StorageRepository } from './r2Storage.repository';
export { FileStorageRepository, createFileStorageRepository } from './fileStorage.repository';
export type { RepositoryStorageType as StorageType };