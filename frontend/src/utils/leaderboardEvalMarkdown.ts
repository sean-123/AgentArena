import { downloadMarkdownFile } from "./summaryReportMarkdown";

/** 与排行榜展开区 /api/reports/leaderboard/detail 一致 */
export interface LeaderboardDetailEvaluation {
  id: string;
  question: string;
  answer: string | null;
  latency: number | null;
  correctness: number | null;
  completeness: number | null;
  clarity: number | null;
  hallucination: number | null;
  avg_score: number | null;
  pros: string | null;
  cons: string | null;
  optimization: string | null;
}

export interface LeaderboardRowMeta {
  task_id: string;
  task_run_id?: string | null;
  task_name?: string | null;
  agent_name: string;
  agent_version_id?: string | null;
  comparison_model_type?: string | null;
  avg_score: number;
  elo: number;
  evaluation_count: number;
}

function fencedBlock(text: string): string {
  const body = (text || "").replace(/\r\n/g, "\n").replace(/```/g, "\\`\\`\\`");
  return "```\n" + body + "\n```\n\n";
}

export function buildLeaderboardExpandedDetailMarkdown(
  meta: LeaderboardRowMeta,
  list: LeaderboardDetailEvaluation[],
): string {
  const taskLine = meta.task_name
    ? `${meta.task_name}（\`${meta.task_id}\`）`
    : `\`${meta.task_id}\``;

  const header: string[] = [
    `# 排行榜评测明细：${meta.agent_name}`,
    "",
    "## 汇总信息",
    "",
    `- **任务**：${taskLine}`,
  ];
  if (meta.task_run_id) {
    header.push(`- **运行批次**：\`${meta.task_run_id}\``);
  }
  header.push(`- **参与者**：${meta.agent_name}`);
  if (meta.agent_version_id) {
    header.push(`- **Agent 版本 ID**：\`${meta.agent_version_id}\``);
  }
  if (meta.comparison_model_type) {
    header.push(`- **对比模型类型**：\`${meta.comparison_model_type}\``);
  }
  header.push(
    `- **平均分**：${meta.avg_score != null ? Number(meta.avg_score).toFixed(2) : "-"}`,
    `- **ELO**：${meta.elo != null ? Math.round(meta.elo) : "-"}`,
    `- **排行榜评测条数**：${meta.evaluation_count}`,
    `- **本文件明细条数**：${list.length}`,
    "",
    "---",
    "",
  );

  const body: string[] = [];
  list.forEach((ev, idx) => {
    body.push(`## 第 ${idx + 1} 题`, "");
    body.push("### 提问", "", fencedBlock(ev.question));
    body.push("### 回答", "", fencedBlock(ev.answer ?? "（无）"));
    body.push("### 评分", "");
    body.push(`- 正确性：${ev.correctness ?? "-"}`);
    body.push(`- 完整性：${ev.completeness ?? "-"}`);
    body.push(`- 清晰度：${ev.clarity ?? "-"}`);
    body.push(`- 幻觉控制：${ev.hallucination ?? "-"}`);
    body.push(`- 平均分：${ev.avg_score != null ? ev.avg_score.toFixed(2) : "-"}`);
    if (ev.latency != null) {
      body.push(`- 耗时：${ev.latency.toFixed(2)} s`);
    }
    body.push("");
    body.push("### 优点（Judge）", "", fencedBlock(ev.pros ?? "（无）"));
    body.push("### 缺点（Judge）", "", fencedBlock(ev.cons ?? "（无）"));
    body.push("### 优化建议（Judge）", "", fencedBlock(ev.optimization ?? "（无）"));
    body.push("---", "");
  });

  return [...header, ...body].join("\n").trim() + "\n";
}

export function downloadLeaderboardExpandedDetailMarkdown(
  meta: LeaderboardRowMeta,
  list: LeaderboardDetailEvaluation[],
): void {
  const md = buildLeaderboardExpandedDetailMarkdown(meta, list);
  const base = `排行榜评测明细_${meta.task_name || meta.task_id}_${meta.agent_name}`;
  downloadMarkdownFile(base, md);
}
