/** 与后端 TaskSummaryReportResponse 对齐，供总结报告展示与 Markdown 导出 */

export interface TopItemExample {
  question: string;
  answer_snippet: string;
}

export interface TopItem {
  text: string;
  count: number;
  examples?: TopItemExample[];
}

export interface OptimizationByCategory {
  answer_modification: string[];
  prompt_optimization: string[];
  rag_optimization: string[];
  agent_development?: string[];
}

export interface AgentSummary {
  agent_name: string;
  agent_version_id: string;
  evaluation_count: number;
  top_pros: TopItem[];
  top_cons: TopItem[];
  optimization: OptimizationByCategory;
}

export interface ComparisonModelSummary {
  model_type: string;
  model_display_name: string;
  evaluation_count: number;
  avg_score?: number;
  top_pros: TopItem[];
  top_cons: TopItem[];
}

export interface PromptOptimizationItem {
  agent_version_id: string;
  agent_name: string;
  prompt_id: string;
  prompt_version: string;
  content_preview: string;
  suggestions: string[];
}

export interface SummaryReport {
  task_id: string;
  task_run_id: string | null;
  task_name: string;
  total_evaluations: number;
  by_agent?: AgentSummary[];
  overall_top_pros?: TopItem[];
  overall_top_cons?: TopItem[];
  overall_optimization?: OptimizationByCategory | null;
  agent_development_suggestions?: string[];
  comparison_by_model?: ComparisonModelSummary[];
  agent_vs_comparison?: string[];
  takeaways_from_comparison?: string[];
  reply_quality_summary?: string;
  info_accuracy_summary?: string;
  reply_experience_suggestions?: string[];
  comparison_reverse_validation?: string[];
  prompt_optimization_by_agent?: PromptOptimizationItem[];
}
