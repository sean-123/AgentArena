import type {
  AgentSummary,
  ComparisonModelSummary,
  OptimizationByCategory,
  PromptOptimizationItem,
  SummaryReport,
  TopItem,
} from "@/types/summaryReport";

/** 文件名安全片段 */
export function sanitizeFilenameBase(name: string, maxLen = 72): string {
  const s = name
    .replace(/[/\\?%*:|"<>.\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  return (s || "report").slice(0, maxLen);
}

export function downloadMarkdownFile(baseName: string, content: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilenameBase(baseName)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

function para(s: string | undefined | null): string {
  if (s == null || !String(s).trim()) return "";
  return `${String(s).trim()}\n\n`;
}

function bullets(lines: (string | undefined | null)[], ordered = false): string {
  const xs = lines.map((l) => String(l ?? "").trim()).filter(Boolean);
  if (!xs.length) return "";
  return (
    xs.map((l, i) => (ordered ? `${i + 1}. ${l}` : `- ${l}`)).join("\n") + "\n\n"
  );
}

function mdTopItems(items: TopItem[] | undefined, title: string, headingLevel = 2): string {
  if (!items?.length) return "";
  const hx = "#".repeat(headingLevel);
  const parts: string[] = [`${hx} ${title}\n`];
  for (const p of items) {
    parts.push(`- **${escapeMdInline(p.text)}**（×${p.count}）`);
    if (p.examples?.length) {
      for (const ex of p.examples) {
        parts.push(`  - **例 · 问**：${escapeMdInline(ex.question ?? "")}`);
        parts.push(`  - **例 · 答**：${escapeMdInline(ex.answer_snippet ?? "")}`);
      }
    }
  }
  parts.push("");
  return parts.join("\n");
}

/** 避免粗体/列表被破坏的轻量转义 */
function escapeMdInline(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\n+/g, " ").replace(/\*\*/g, "\\*\\*");
}

function optimizationMd(
  opt: OptimizationByCategory | null | undefined,
  headingLevel = 3,
  categoryPrefix = "类别",
): string {
  if (!opt) return "";
  const hx = "#".repeat(headingLevel);
  const head = (suffix: string) =>
    (categoryPrefix ? `${hx} ${categoryPrefix} — ${suffix}\n\n` : `${hx} ${suffix}\n\n`);
  const chunks: string[] = [];
  if (opt.answer_modification?.length) {
    chunks.push(head("回答修改"), bullets(opt.answer_modification));
  }
  if (opt.prompt_optimization?.length) {
    chunks.push(head("提示词"), bullets(opt.prompt_optimization.map((s) => `[提示词] ${s}`)));
  }
  if (opt.rag_optimization?.length) {
    chunks.push(head("RAG"), bullets(opt.rag_optimization.map((s) => `[RAG] ${s}`)));
  }
  if (opt.agent_development?.length) {
    chunks.push(head("Agent 架构/开发"), bullets(opt.agent_development.map((s) => `[Agent 开发] ${s}`)));
  }
  return chunks.length ? chunks.join("") + "\n" : "";
}

function taskContextBlockquote(data: SummaryReport): string {
  return [
    `> 所属任务：${escapeMdInline(data.task_name)}（\`${data.task_id}\`）`,
    `> 批次：\`${data.task_run_id ?? "—"}\``,
    "",
  ].join("\n");
}

function reportMetaHeader(data: SummaryReport): string {
  const run = data.task_run_id ?? "（未指定）";
  return [
    `# 批次总结报告：${escapeMdInline(data.task_name)}`,
    "",
    `- **任务 ID**：\`${data.task_id}\``,
    `- **运行批次**：\`${run}\``,
    `- **评测条数**：${data.total_evaluations}`,
    "",
    "---",
    "",
  ].join("\n");
}

export function buildFullTaskSummaryMarkdown(data: SummaryReport): string {
  const parts: string[] = [reportMetaHeader(data)];

  if (data.reply_quality_summary || data.info_accuracy_summary || data.reply_experience_suggestions?.length) {
    parts.push("## 质量总评\n\n");
    parts.push(para(data.reply_quality_summary ? `**回复质量**：${data.reply_quality_summary}` : ""));
    parts.push(para(data.info_accuracy_summary ? `**信息准确度**：${data.info_accuracy_summary}` : ""));
    if (data.reply_experience_suggestions?.length) {
      parts.push("**回复体验改进建议**：\n\n", bullets(data.reply_experience_suggestions));
    }
  }

  parts.push(mdTopItems(data.overall_top_pros ?? [], "全局高频优点"));
  parts.push(mdTopItems(data.overall_top_cons ?? [], "全局高频缺点"));

  if (data.overall_optimization) {
    const o = data.overall_optimization;
    const has =
      (o.answer_modification?.length ?? 0) > 0 ||
      (o.prompt_optimization?.length ?? 0) > 0 ||
      (o.rag_optimization?.length ?? 0) > 0 ||
      (o.agent_development?.length ?? 0) > 0;
    if (has) {
      parts.push("## 优化建议汇总\n\n", optimizationMd(data.overall_optimization, 3, "类别"));
    }
  }

  if (data.agent_development_suggestions?.length) {
    parts.push("## Agent 开发优化建议\n\n", "基于整批次评测提炼的开发方向与优化建议。\n\n", bullets(data.agent_development_suggestions));
  }

  if ((data.by_agent ?? []).length) {
    parts.push("## 各 Agent 详情\n\n", taskContextBlockquote(data), "\n\n");
    for (const ag of data.by_agent ?? []) {
      parts.push(
        `### ${escapeMdInline(ag.agent_name)}\n\n`,
        `- **版本 ID**：\`${ag.agent_version_id}\` · **评测条数**：${ag.evaluation_count}\n\n`,
        mdTopItems(ag.top_pros, "优点", 4),
        mdTopItems(ag.top_cons, "缺点", 4),
        optimizationMd(ag.optimization, 4, ""),
        "\n---\n\n",
      );
    }
  }

  if (data.comparison_by_model?.length) {
    parts.push("## 对比通用大模型\n\n", taskContextBlockquote(data), "\n\n");
    for (const cm of data.comparison_by_model) {
      const score = cm.avg_score != null ? ` · 平均分 ${cm.avg_score}` : "";
      parts.push(
        `### ${escapeMdInline(cm.model_display_name)}\n\n`,
        `- **类型**：\`${cm.model_type}\` · **评测条数**：${cm.evaluation_count}${score}\n\n`,
        mdTopItems(cm.top_pros, "优点", 4),
        mdTopItems(cm.top_cons, "缺点", 4),
        "\n---\n\n",
      );
    }
  }

  if (data.agent_vs_comparison?.length) {
    parts.push("## Agent 对比通用大模型\n\n", bullets(data.agent_vs_comparison));
  }
  if (data.takeaways_from_comparison?.length) {
    parts.push("## 借鉴通用大模型的可取之处\n\n", bullets(data.takeaways_from_comparison));
  }
  if (data.comparison_reverse_validation?.length) {
    parts.push("## 通用大模型反向验证\n\n", bullets(data.comparison_reverse_validation));
  }

  if (data.prompt_optimization_by_agent?.length) {
    parts.push("## Langfuse Prompt 优化建议\n\n", taskContextBlockquote(data), "\n\n");
    for (const item of data.prompt_optimization_by_agent) {
      parts.push(
        `### ${escapeMdInline(item.agent_name)} / \`${item.prompt_id}\`\n\n`,
        `- **Agent 版本 ID**：\`${item.agent_version_id}\` · **Prompt 版本**：${item.prompt_version || "default"}\n\n`,
        promptItemBodyMarkdown(item, 4),
        "\n---\n\n",
      );
    }
  }

  if (data.total_evaluations === 0) {
    parts.push("\n*暂无评测数据，无法生成总结报告。*\n");
  }

  return parts.join("").trim() + "\n";
}

export function buildAgentSubMarkdown(data: SummaryReport, ag: AgentSummary): string {
  const h = [
    `## Agent：${escapeMdInline(ag.agent_name)}`,
    "",
    `- **版本 ID**：\`${ag.agent_version_id}\``,
    `- **评测条数**：${ag.evaluation_count}`,
    "",
  ].join("\n");
  const ctx = [
    `> 所属任务：${escapeMdInline(data.task_name)}（\`${data.task_id}\`）`,
    `> 批次：\`${data.task_run_id ?? "—"}\``,
    "",
  ].join("\n");
  let body = "";
  body += mdTopItems(ag.top_pros, "优点", 3);
  body += mdTopItems(ag.top_cons, "缺点", 3);
  body += optimizationMd(ag.optimization, 3, "优化建议");
  return `${h}${ctx}\n${body}`.trim() + "\n";
}

export function buildComparisonSubMarkdown(data: SummaryReport, cm: ComparisonModelSummary): string {
  const score = cm.avg_score != null ? ` · 平均分 ${cm.avg_score}` : "";
  const h = [
    `## 对比模型：${escapeMdInline(cm.model_display_name)}`,
    "",
    `- **类型**：\`${cm.model_type}\``,
    `- **评测条数**：${cm.evaluation_count}${score}`,
    "",
  ].join("\n");
  const ctx = [
    `> 所属任务：${escapeMdInline(data.task_name)}（\`${data.task_id}\`）`,
    `> 批次：\`${data.task_run_id ?? "—"}\``,
    "",
  ].join("\n");
  let body = "";
  body += mdTopItems(cm.top_pros, "优点", 3);
  body += mdTopItems(cm.top_cons, "缺点", 3);
  return `${h}${ctx}\n${body}`.trim() + "\n";
}

function promptItemBodyMarkdown(item: PromptOptimizationItem, headingLevel = 3): string {
  const hx = "#".repeat(headingLevel);
  let body = "";
  if (item.content_preview?.trim()) {
    body += `${hx} 内容摘要\n\n\`\`\`\n${item.content_preview.replace(/```/g, "\\`\\`\\`")}\n\`\`\`\n\n`;
  }
  if (item.suggestions?.length) {
    body += `${hx} 优化建议\n\n` + bullets(item.suggestions);
  }
  return body;
}

export function buildPromptOptimizationSubMarkdown(data: SummaryReport, item: PromptOptimizationItem): string {
  const h = [
    `## Langfuse Prompt：${escapeMdInline(item.agent_name)}`,
    "",
    `- **Agent 版本 ID**：\`${item.agent_version_id}\``,
    `- **Prompt**：\`${item.prompt_id}\` v${item.prompt_version || "default"}`,
    "",
  ].join("\n");
  const ctx = [
    `> 所属任务：${escapeMdInline(data.task_name)}（\`${data.task_id}\`）`,
    `> 批次：\`${data.task_run_id ?? "—"}\``,
    "",
  ].join("\n");
  const body = promptItemBodyMarkdown(item, 3);
  return `${h}${ctx}\n${body}`.trim() + "\n";
}

export function downloadFullSummaryMarkdown(data: SummaryReport): void {
  const md = buildFullTaskSummaryMarkdown(data);
  const base = `批次总结_${data.task_name}_${data.task_id}_${data.task_run_id ?? "run"}`;
  downloadMarkdownFile(base, md);
}

export function downloadAgentSummaryMarkdown(data: SummaryReport, ag: AgentSummary): void {
  const md = buildAgentSubMarkdown(data, ag);
  const base = `批次总结_Agent_${ag.agent_name}_${ag.agent_version_id}`;
  downloadMarkdownFile(base, md);
}

export function downloadComparisonSummaryMarkdown(data: SummaryReport, cm: ComparisonModelSummary): void {
  const md = buildComparisonSubMarkdown(data, cm);
  const base = `批次总结_对比模型_${cm.model_display_name}_${cm.model_type}`;
  downloadMarkdownFile(base, md);
}

export function downloadPromptOptimizationMarkdown(data: SummaryReport, item: PromptOptimizationItem): void {
  const md = buildPromptOptimizationSubMarkdown(data, item);
  const base = `批次总结_Prompt_${item.agent_name}_${item.prompt_id}`;
  downloadMarkdownFile(base, md);
}
