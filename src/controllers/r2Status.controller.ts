// R2 狀態檢查 Controller

import { Request, Response } from 'express';
import { createR2StorageRepository } from '../infrastructure/repositories/r2Storage.repository';
import { checkR2StatusUseCase, generateMissingDataList } from '../usecases/checkR2Status.useCase';

/**
 * 檢查 R2 上所有影片的狀態
 * GET /api/r2/check-status
 * Query params:
 *   - languages: 逗號分隔的語言列表，例如 "default,zh-TW,en"
 *   - videoIds: 逗號分隔的影片 ID 列表（可選）
 */
export async function checkR2StatusController(req: Request, res: Response) {
  try {
    const languagesParam = req.query.languages as string;
    const videoIdsParam = req.query.videoIds as string;

    const languages = languagesParam 
      ? languagesParam.split(',').map(l => l.trim())
      : ['default'];

    const videoIds = videoIdsParam
      ? videoIdsParam.split(',').map(id => id.trim())
      : undefined;

    console.log(`[R2 Status] Checking status for languages: ${languages.join(', ')}`);
    if (videoIds) {
      console.log(`[R2 Status] Filtering by video IDs: ${videoIds.join(', ')}`);
    }

    const storageRepo = createR2StorageRepository();
    const report = await checkR2StatusUseCase(storageRepo, { languages, videoIds });

    res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('[R2 Status] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 獲取缺少資料的影片列表
 * GET /api/r2/missing-data
 * Query params:
 *   - languages: 逗號分隔的語言列表
 *   - filterType: 過濾類型 (srt | segments | summary)
 *   - videoIds: 逗號分隔的影片 ID 列表（可選）
 */
export async function getMissingDataController(req: Request, res: Response) {
  try {
    const languagesParam = req.query.languages as string;
    const filterType = req.query.filterType as 'srt' | 'segments' | 'summary' | undefined;
    const videoIdsParam = req.query.videoIds as string;

    const languages = languagesParam 
      ? languagesParam.split(',').map(l => l.trim())
      : ['default'];

    const videoIds = videoIdsParam
      ? videoIdsParam.split(',').map(id => id.trim())
      : undefined;

    const storageRepo = createR2StorageRepository();
    const report = await checkR2StatusUseCase(storageRepo, { languages, videoIds });
    const missingList = generateMissingDataList(report, filterType);

    res.json({
      success: true,
      total: missingList.length,
      missingData: missingList,
      summary: report.summary,
    });
  } catch (error) {
    console.error('[R2 Missing Data] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * 生成詳細的狀態報告（Markdown 格式）
 * GET /api/r2/status-report
 * Query params:
 *   - languages: 逗號分隔的語言列表
 *   - onlyMissing: 只顯示缺少資料的影片 (true/false)
 */
export async function generateStatusReportController(req: Request, res: Response) {
  try {
    const languagesParam = req.query.languages as string;
    const onlyMissing = req.query.onlyMissing === 'true';

    const languages = languagesParam 
      ? languagesParam.split(',').map(l => l.trim())
      : ['default'];

    const storageRepo = createR2StorageRepository();
    const report = await checkR2StatusUseCase(storageRepo, { languages });

    // 生成 Markdown 報告
    let markdown = '# R2 Storage Status Report\n\n';
    markdown += `**Generated at:** ${new Date().toISOString()}\n\n`;
    markdown += `**Total Videos:** ${report.totalVideos}\n`;
    markdown += `**Checked Languages:** ${report.checkedLanguages.join(', ')}\n`;
    markdown += `**Videos with Missing Data:** ${report.summary.videosWithMissingData}\n`;
    markdown += `**Total Missing Items:** ${report.summary.totalMissingItems}\n\n`;

    markdown += '## Missing Items by Type\n\n';
    markdown += `- Missing SRT: ${report.summary.missingByType.srt}\n`;
    markdown += `- Missing Segments: ${report.summary.missingByType.segments}\n`;
    markdown += `- Missing Summary: ${report.summary.missingByType.summary}\n\n`;

    markdown += '## Video Details\n\n';

    const videosToShow = onlyMissing 
      ? report.videos.filter(v => v.missingCount > 0)
      : report.videos;

    for (const video of videosToShow) {
      markdown += `### ${video.videoId}\n`;
      if (video.title) {
        markdown += `**Title:** ${video.title}\n`;
      }
      markdown += `**Missing Items:** ${video.missingCount}\n\n`;

      for (const [language, status] of Object.entries(video.languages)) {
        markdown += `#### Language: ${language}\n`;
        markdown += `- SRT: ${status.hasSrt ? '✅' : '❌'}\n`;
        markdown += `- Segments: ${status.hasSegments ? '✅' : '❌'}\n`;
        markdown += `- Summary: ${status.hasSummary ? '✅' : '❌'}\n`;
        if (status.missing.length > 0) {
          markdown += `- **Missing:** ${status.missing.join(', ')}\n`;
        }
        markdown += '\n';
      }
    }

    res.setHeader('Content-Type', 'text/markdown');
    res.send(markdown);
  } catch (error) {
    console.error('[R2 Status Report] Error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
