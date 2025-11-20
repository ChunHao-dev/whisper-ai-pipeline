// 檢查 R2 上影片處理狀態的 Use Case

import { StorageRepository } from '../domain/repositories/storage.repository';

export interface R2VideoStatus {
  videoId: string;
  title?: string;
  languages: {
    [language: string]: {
      hasSrt: boolean;
      hasSegments: boolean;
      hasSummary: boolean;
      missing: string[]; // 缺少的項目列表
    };
  };
  missingCount: number; // 總共缺少的項目數量
}

export interface R2StatusReport {
  totalVideos: number;
  checkedLanguages: string[];
  videos: R2VideoStatus[];
  summary: {
    videosWithMissingData: number;
    totalMissingItems: number;
    missingByType: {
      srt: number;
      segments: number;
      summary: number;
    };
  };
}

/**
 * 檢查單個影片在特定語言下的狀態
 */
async function checkVideoLanguageStatus(
  videoId: string,
  language: string,
  storageRepo: StorageRepository
): Promise<{
  hasSrt: boolean;
  hasSegments: boolean;
  hasSummary: boolean;
  missing: string[];
}> {
  const normalizedLanguage = language === 'auto' ? 'default' : language;
  
  // 檢查各個檔案是否存在
  const srtPath = `${videoId}/${normalizedLanguage}/${videoId}.srt`;
  const segmentsPath = `${videoId}/${normalizedLanguage}/segments.json`;
  const summaryPath = `${videoId}/${normalizedLanguage}/summary.json`;

  const [hasSrt, hasSegments, hasSummary] = await Promise.all([
    checkR2FileExists(storageRepo, srtPath),
    checkR2FileExists(storageRepo, segmentsPath),
    checkR2FileExists(storageRepo, summaryPath),
  ]);

  const missing: string[] = [];
  if (!hasSrt) missing.push('srt');
  if (!hasSegments) missing.push('segments');
  if (!hasSummary) missing.push('summary');

  return {
    hasSrt,
    hasSegments,
    hasSummary,
    missing,
  };
}

/**
 * 檢查 R2 檔案是否存在（使用 aws s3 ls）
 */
async function checkR2FileExists(
  storageRepo: StorageRepository,
  remotePath: string
): Promise<boolean> {
  try {
    const bucketName = process.env.R2_BUCKET_NAME || '';
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execPromise = promisify(exec);

    const remoteUrl = `s3://${bucketName}/${remotePath}`;
    const command = `aws s3 ls "${remoteUrl}" --profile cloudflare`;

    const { stdout } = await execPromise(command);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * 批次檢查 R2 上所有影片的狀態
 */
export async function checkR2StatusUseCase(
  storageRepo: StorageRepository,
  options: {
    languages?: string[]; // 要檢查的語言列表，預設 ['default']
    videoIds?: string[]; // 指定要檢查的影片 ID，不指定則檢查 VideoList 中的所有影片
  } = {}
): Promise<R2StatusReport> {
  const languages = options.languages || ['default'];
  let videoList = await storageRepo.getVideoList();

  // 如果指定了 videoIds，只檢查這些影片
  if (options.videoIds && options.videoIds.length > 0) {
    videoList = videoList.filter(video => 
      options.videoIds!.includes(video.id || video.videoId || '')
    );
  }

  console.log(`[R2 Status Check] Checking ${videoList.length} videos for languages: ${languages.join(', ')}`);

  const videos: R2VideoStatus[] = [];
  const summary = {
    videosWithMissingData: 0,
    totalMissingItems: 0,
    missingByType: {
      srt: 0,
      segments: 0,
      summary: 0,
    },
  };

  // 檢查每個影片
  for (const video of videoList) {
    const videoId = video.id || video.videoId || '';
    if (!videoId) continue;

    console.log(`[R2 Status Check] Checking video: ${videoId}`);

    const videoStatus: R2VideoStatus = {
      videoId,
      title: video.title,
      languages: {},
      missingCount: 0,
    };

    // 檢查每個語言
    for (const language of languages) {
      const langStatus = await checkVideoLanguageStatus(videoId, language, storageRepo);
      videoStatus.languages[language] = langStatus;
      videoStatus.missingCount += langStatus.missing.length;

      // 更新統計
      if (!langStatus.hasSrt) summary.missingByType.srt++;
      if (!langStatus.hasSegments) summary.missingByType.segments++;
      if (!langStatus.hasSummary) summary.missingByType.summary++;
    }

    videos.push(videoStatus);

    if (videoStatus.missingCount > 0) {
      summary.videosWithMissingData++;
      summary.totalMissingItems += videoStatus.missingCount;
    }
  }

  console.log(`[R2 Status Check] Complete. Found ${summary.videosWithMissingData} videos with missing data.`);

  return {
    totalVideos: videoList.length,
    checkedLanguages: languages,
    videos,
    summary,
  };
}

/**
 * 生成缺少資料的影片列表（用於批次處理）
 */
export function generateMissingDataList(
  report: R2StatusReport,
  filterType?: 'srt' | 'segments' | 'summary'
): Array<{ videoId: string; language: string; missing: string[] }> {
  const result: Array<{ videoId: string; language: string; missing: string[] }> = [];

  for (const video of report.videos) {
    for (const [language, status] of Object.entries(video.languages)) {
      if (status.missing.length === 0) continue;

      // 如果指定了過濾類型，只返回缺少該類型的影片
      if (filterType && !status.missing.includes(filterType)) continue;

      result.push({
        videoId: video.videoId,
        language,
        missing: status.missing,
      });
    }
  }

  return result;
}
