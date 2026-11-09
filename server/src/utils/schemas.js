import { z } from 'zod';

/* 大模型总结输出：与需求合同一致 */
export const summarySchema = z.object({
  title: z.string().trim().min(1).max(16),
  content: z.string().trim().min(80).max(200),
  tags: z.array(z.string().trim().min(1)).min(2).max(5),
});

/* 手动文本兜底入参 */
export const fromTextInputSchema = z.object({
  text: z.string().trim().min(1).max(5000),
});

/* 归档分类输出：一次调用同时给出主题、颜色与近义罐序号（无近义为 null）*/
export const classifyWithJarSchema = z.object({
  theme: z.string().trim().min(1).max(8),
  color: z.enum([
    '#b8a4e8',
    '#8ec9e8',
    '#e8a4c9',
    '#a4e8c9',
    '#e8d28e',
    '#e8a896',
  ]),
  matchedIndex: z.number().int().min(1).nullable(),
});

/* 关联语义输出：大模型只给语义分，其余三维后端确定性计算 */
export const semanticScoreSchema = z.object({
  semantic: z.number().int().min(0).max(50),
  reason: z.string().trim().min(1).max(80),
});

/* 融合入参：目标非空、最多 2 个 */
export const fuseInputSchema = z.object({
  targetIds: z.array(z.string().trim().min(1)).min(1).max(2),
});
