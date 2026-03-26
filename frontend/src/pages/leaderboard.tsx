"use client";

import React, { useEffect, useState } from "react";
import { Table, Card, Select, message, Spin, Typography, Modal } from "antd";
import { FileTextOutlined, FullscreenOutlined } from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet } from "@/api/client";

interface TopItemExample {
  question: string;
  answer_snippet: string;
}

interface TopItem {
  text: string;
  count: number;
  examples?: TopItemExample[];
}

interface OptimizationByCategory {
  answer_modification: string[];
  prompt_optimization: string[];
  rag_optimization: string[];
  agent_development?: string[];
}

interface AgentSummary {
  agent_name: string;
  agent_version_id: string;
  evaluation_count: number;
  top_pros: TopItem[];
  top_cons: TopItem[];
  optimization: OptimizationByCategory;
}

interface ComparisonModelSummary {
  model_type: string;
  model_display_name: string;
  evaluation_count: number;
  avg_score?: number;
  top_pros: TopItem[];
  top_cons: TopItem[];
}

interface SummaryReport {
  task_id: string;
  task_run_id: string | null;
  task_name: string;
  total_evaluations: number;
  by_agent?: AgentSummary[];
  overall_top_pros: TopItem[];
  overall_top_cons: TopItem[];
  overall_optimization: OptimizationByCategory | null;
  agent_development_suggestions: string[];
  comparison_by_model?: ComparisonModelSummary[];
  agent_vs_comparison?: string[];
  takeaways_from_comparison?: string[];
  reply_quality_summary?: string;
  info_accuracy_summary?: string;
  reply_experience_suggestions?: string[];
  comparison_reverse_validation?: string[];
  prompt_optimization_by_agent?: {
    agent_version_id: string;
    agent_name: string;
    prompt_id: string;
    prompt_version: string;
    content_preview: string;
    suggestions: string[];
  }[];
}

const T = {
  loadFailed: (() => String.fromCodePoint(0x52a0, 0x8f7d, 0x5931, 0x8d25))(),
  loadDetailFailed: (() => String.fromCodePoint(0x52a0, 0x8f7d, 0x8be6, 0x60c5, 0x5931, 0x8d25))(),
  noData: (() => String.fromCodePoint(0x65e0, 0x6570, 0x636e))(),
  questionNum: (n: number) =>
    String.fromCodePoint(0x7b2c) + " " + n + " " + String.fromCodePoint(0x9898),
  question: (() => String.fromCodePoint(0x63d0, 0x95ee))(),
  answer: (() => String.fromCodePoint(0x56de, 0x7b54))(),
  correctness: (() => String.fromCodePoint(0x6b63, 0x786e, 0x6027))(),
  completeness: (() => String.fromCodePoint(0x5b8c, 0x6574, 0x6027))(),
  clarity: (() => String.fromCodePoint(0x6e05, 0x6670, 0x5ea6))(),
  hallucination: (() => String.fromCodePoint(0x5e7b, 0x89c9))(),
  avgScore: (() => String.fromCodePoint(0x5e73, 0x5747, 0x5206))(),
  latency: (() => String.fromCodePoint(0x8017, 0x65f6))(),
  pros: (() => String.fromCodePoint(0x4f18, 0x70b9))(),
  cons: (() => String.fromCodePoint(0x7f3a, 0x70b9))(),
  optimization: (() => String.fromCodePoint(0x4f18, 0x5316, 0x5efa, 0x8bae))(),
  leaderboard: (() => String.fromCodePoint(0x6392, 0x884c, 0x699c))(),
  filterTask: (() => String.fromCodePoint(0x7b5b, 0x9009, 0x4efb, 0x52a1))(),
  allTasks: (() => String.fromCodePoint(0x5168, 0x90e8, 0x4efb, 0x52a1))(),
  filterRun: (() => String.fromCodePoint(0x8fd0, 0x884c, 0x6279, 0x6b21))(),
  latestRun: (() => String.fromCodePoint(0x6700, 0x65b0, 0x4e00, 0x6b21))(),
  rank: (() => String.fromCodePoint(0x6392, 0x540d))(),
  taskId: (() => String.fromCodePoint(0x4efb, 0x52a1) + " ID")(),
  evalCount: (() => String.fromCodePoint(0x8bc4, 0x6d4b, 0x6b21, 0x6570))(),
};

interface EvaluationWithScore {
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

interface LeaderboardEntry {
  id: string;
  task_id: string;
  task_run_id?: string | null;
  agent_name: string;
  agent_version_id?: string | null;
  avg_score: number;
  elo: number;
  evaluation_count: number;
  created_at: string;
}

interface Task {
  id: string;
  name: string;
}

interface TaskRun {
  id: string;
  task_id: string;
  status: string;
  created_at?: string;
}

export default function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskRuns, setTaskRuns] = useState<TaskRun[]>([]);
  const [taskFilter, setTaskFilter] = useState<string | undefined>();
  const [runFilter, setRunFilter] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  const [detailCache, setDetailCache] = useState<Record<string, EvaluationWithScore[]>>({});
  const [detailLoading, setDetailLoading] = useState<Record<string, boolean>>({});
  const [summaryData, setSummaryData] = useState<SummaryReport | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  const loadLeaderboard = async () => {
    try {
      const parts: string[] = [];
      if (taskFilter) parts.push(`task_id=${taskFilter}`);
      if (runFilter) parts.push(`task_run_id=${runFilter}`);
      const params = parts.length ? "?" + parts.join("&") : "";
      const list = await apiGet<LeaderboardEntry[]>(`/api/reports/leaderboard${params}`);
      setData(list);
    } catch (e) {
      message.error(T.loadFailed + ": " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      const list = await apiGet<Task[]>("/api/tasks");
      setTasks(list);
    } catch {
      // ignore
    }
  };

  const loadDetail = async (record: LeaderboardEntry) => {
    const { task_id, agent_version_id, task_run_id, id } = record;
    if (!task_id || !agent_version_id) return;
    if (detailCache[id]) return;
    setDetailLoading((prev) => ({ ...prev, [id]: true }));
    try {
      let url = `/api/reports/leaderboard/detail?task_id=${task_id}&agent_version_id=${agent_version_id}`;
      if (task_run_id) url += `&task_run_id=${task_run_id}`;
      const list = await apiGet<EvaluationWithScore[]>(url);
      setDetailCache((prev) => ({ ...prev, [id]: list }));
    } catch (e) {
      message.error(T.loadDetailFailed + ": " + (e as Error).message);
    } finally {
      setDetailLoading((prev) => ({ ...prev, [id]: false }));
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  useEffect(() => {
    if (taskFilter) {
      apiGet<TaskRun[]>(`/api/tasks/${taskFilter}/runs`)
        .then((runs) => setTaskRuns(runs))
        .catch(() => setTaskRuns([]));
      setRunFilter(undefined);
    } else {
      setTaskRuns([]);
      setRunFilter(undefined);
    }
  }, [taskFilter]);

  useEffect(() => {
    setLoading(true);
    setExpandedRowKeys([]);
    setDetailCache({});
    loadLeaderboard();
  }, [taskFilter, runFilter]);

  // 筛选任务时加载该任务对应批次的总结报告
  useEffect(() => {
    if (!taskFilter || taskFilter === "" || taskFilter === "__all__") {
      setSummaryData(null);
      return;
    }
    setSummaryLoading(true);
    setSummaryData(null);
    const params = new URLSearchParams({ task_id: taskFilter });
    if (runFilter && runFilter !== "") params.set("task_run_id", runFilter);
    apiGet<SummaryReport>(`/api/reports/summary?${params}`)
      .then(setSummaryData)
      .catch((e) => {
        setSummaryData(null);
        message.error("加载总结报告失败: " + (e as Error).message);
      })
      .finally(() => setSummaryLoading(false));
  }, [taskFilter, runFilter]);

  const onExpand = (expanded: boolean, record: LeaderboardEntry) => {
    const keys = expanded
      ? [...expandedRowKeys, record.id]
      : expandedRowKeys.filter((k) => k !== record.id);
    setExpandedRowKeys(keys);
    if (expanded && record.task_id && record.agent_version_id) {
      loadDetail(record);
    }
  };

  const expandedRowRender = (record: LeaderboardEntry) => {
    const { task_id, agent_version_id, id } = record;
    if (!task_id || !agent_version_id) {
      return <div style={{ padding: 16, color: "#999" }}>{T.noData}</div>;
    }
    if (detailLoading[id]) {
      return (
        <div style={{ padding: 24, textAlign: "center" }}>
          <Spin />
        </div>
      );
    }
    const list = detailCache[id] || [];
    if (list.length === 0) {
      return <div style={{ padding: 16, color: "#999" }}>{T.noData}</div>;
    }
    return (
      <div style={{ padding: "0 16px 16px" }}>
        {list.map((ev, idx) => (
          <Card key={ev.id} size="small" style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 8, fontWeight: 500 }}>{T.questionNum(idx + 1)}</div>
            <div style={{ marginBottom: 8 }}>
              <strong>{T.question}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{ev.question}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>{T.answer}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{ev.answer ?? "-"}</div>
            </div>
            <div style={{ marginBottom: 8, display: "flex", gap: 16 }}>
              <span>{T.correctness}: {ev.correctness ?? "-"}</span>
              <span>{T.completeness}: {ev.completeness ?? "-"}</span>
              <span>{T.clarity}: {ev.clarity ?? "-"}</span>
              <span>{T.hallucination}: {ev.hallucination ?? "-"}</span>
              <span>{T.avgScore}: {ev.avg_score != null ? ev.avg_score.toFixed(2) : "-"}</span>
              {ev.latency != null && <span>{T.latency}: {ev.latency.toFixed(2)}s</span>}
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>{T.pros}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{ev.pros ?? "-"}</div>
            </div>
            <div style={{ marginBottom: 8 }}>
              <strong>{T.cons}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{ev.cons ?? "-"}</div>
            </div>
            <div>
              <strong>{T.optimization}</strong>
              <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{ev.optimization ?? "-"}</div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderFullSummary = (data: SummaryReport) => (
    <div style={{ maxHeight: "70vh", overflow: "auto" }}>
      <Typography.Paragraph type="secondary">
        共 {data.total_evaluations} 条评测，按 Agent 聚合优缺点与优化建议
      </Typography.Paragraph>

      {(data.reply_quality_summary || data.info_accuracy_summary || (data.reply_experience_suggestions?.length ?? 0) > 0) && (
        <div style={{ marginTop: 16, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
          <Typography.Title level={5} style={{ marginTop: 0, color: "#1677ff" }}>质量总评</Typography.Title>
          {data.reply_quality_summary && (
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>回复质量：</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.reply_quality_summary}</Typography.Paragraph>
            </div>
          )}
          {data.info_accuracy_summary && (
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>信息准确度：</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.info_accuracy_summary}</Typography.Paragraph>
            </div>
          )}
          {data.reply_experience_suggestions?.length ? (
            <div>
              <Typography.Text strong>回复体验改进建议：</Typography.Text>
              <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                {data.reply_experience_suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {(data.overall_top_pros?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#52c41a" }}>全局高频优点</Typography.Title>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            {data.overall_top_pros.map((p, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <span>{p.text}</span>
                <span style={{ color: "#999", marginLeft: 8 }}>×{p.count}</span>
                {p.examples?.length ? (
                  <div style={{ marginTop: 6, marginLeft: 0, fontSize: 13, color: "#595959" }}>
                    {p.examples.map((ex, j) => (
                      <div key={j} style={{ marginBottom: 4, padding: 8, background: "#fafafa", borderRadius: 4 }}>
                        <div><strong>例：</strong>问：「{ex.question?.slice(0, 80)}{ex.question && ex.question.length > 80 ? "…" : ""}」</div>
                        <div style={{ marginTop: 4 }}>答：「{ex.answer_snippet?.slice(0, 120)}{ex.answer_snippet && ex.answer_snippet.length > 120 ? "…" : ""}」</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {(data.overall_top_cons?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#ff4d4f" }}>全局高频缺点</Typography.Title>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            {data.overall_top_cons.map((c, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <span>{c.text}</span>
                <span style={{ color: "#999", marginLeft: 8 }}>×{c.count}</span>
                {c.examples?.length ? (
                  <div style={{ marginTop: 6, marginLeft: 0, fontSize: 13, color: "#595959" }}>
                    {c.examples.map((ex, j) => (
                      <div key={j} style={{ marginBottom: 4, padding: 8, background: "#fff2f0", borderRadius: 4 }}>
                        <div><strong>例：</strong>问：「{ex.question?.slice(0, 80)}{ex.question && ex.question.length > 80 ? "…" : ""}」</div>
                        <div style={{ marginTop: 4 }}>答：「{ex.answer_snippet?.slice(0, 120)}{ex.answer_snippet && ex.answer_snippet.length > 120 ? "…" : ""}」</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.overall_optimization &&
        ((data.overall_optimization.answer_modification?.length ?? 0) > 0 ||
          (data.overall_optimization.prompt_optimization?.length ?? 0) > 0 ||
          (data.overall_optimization.rag_optimization?.length ?? 0) > 0 ||
          (data.overall_optimization.agent_development?.length ?? 0) > 0) && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#1890ff" }}>优化建议汇总</Typography.Title>
          {(data.overall_optimization.answer_modification?.length ?? 0) > 0 && (
            <>
              <Typography.Text strong style={{ display: "block", marginTop: 8 }}>回答修改建议</Typography.Text>
              <ul style={{ paddingLeft: 20 }}>
                {data.overall_optimization.answer_modification.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {(data.overall_optimization.prompt_optimization?.length ?? 0) > 0 && (
            <>
              <Typography.Text strong style={{ display: "block", marginTop: 8 }}>提示词优化</Typography.Text>
              <ul style={{ paddingLeft: 20 }}>
                {data.overall_optimization.prompt_optimization.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {(data.overall_optimization.rag_optimization?.length ?? 0) > 0 && (
            <>
              <Typography.Text strong style={{ display: "block", marginTop: 8 }}>RAG 相关优化</Typography.Text>
              <ul style={{ paddingLeft: 20 }}>
                {data.overall_optimization.rag_optimization.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {(data.overall_optimization.agent_development?.length ?? 0) > 0 && (
            <>
              <Typography.Text strong style={{ display: "block", marginTop: 8 }}>Agent 架构/模型优化</Typography.Text>
              <ul style={{ paddingLeft: 20 }}>
                {(data.overall_optimization.agent_development ?? []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {(data.agent_development_suggestions?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#722ed1" }}>Agent 开发优化建议</Typography.Title>
          <Typography.Paragraph type="secondary">基于整批次评测提炼的开发方向与优化建议</Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {(data.agent_development_suggestions ?? []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {(data.by_agent?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>各 Agent 详情</Typography.Title>
          {(data.by_agent ?? []).map((ag) => (
            <Card key={ag.agent_version_id} size="small" style={{ marginBottom: 12 }}>
              <Typography.Text strong>{ag.agent_name}</Typography.Text>
              <span style={{ color: "#999", marginLeft: 8 }}>{ag.evaluation_count} 条评测</span>
              <div style={{ marginTop: 8 }}>
                {(ag.top_pros?.length ?? 0) > 0 && (
                  <div>
                    <Typography.Text type="success">优点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {ag.top_pros.map((p, i) => (
                        <li key={i}>{p.text}<span style={{ color: "#999" }}> ×{p.count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {(ag.top_cons?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="danger">缺点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {ag.top_cons.map((c, i) => (
                        <li key={i}>{c.text}<span style={{ color: "#999" }}> ×{c.count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {((ag.optimization?.answer_modification?.length ?? 0) > 0 ||
                  (ag.optimization?.prompt_optimization?.length ?? 0) > 0 ||
                  (ag.optimization?.rag_optimization?.length ?? 0) > 0 ||
                  (ag.optimization?.agent_development?.length ?? 0) > 0) && (
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text>优化：</Typography.Text>
                    {ag.optimization.answer_modification?.map((s, i) => (
                      <div key={`a-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>· {s}</div>
                    ))}
                    {ag.optimization.prompt_optimization?.map((s, i) => (
                      <div key={`p-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>· [提示词] {s}</div>
                    ))}
                    {ag.optimization.rag_optimization?.map((s, i) => (
                      <div key={`r-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>· [RAG] {s}</div>
                    ))}
                    {ag.optimization.agent_development?.map((s, i) => (
                      <div key={`d-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>· [Agent 开发] {s}</div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </>
      )}

      {data.comparison_by_model && data.comparison_by_model.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, color: "#fa8c16" }}>对比通用大模型</Typography.Title>
          {data.comparison_by_model.map((cm) => (
            <Card key={cm.model_type} size="small" style={{ marginBottom: 12 }}>
              <Typography.Text strong>{cm.model_display_name}</Typography.Text>
              <span style={{ color: "#999", marginLeft: 8 }}>
                {cm.evaluation_count} 条评测
                {cm.avg_score != null ? ` · 平均分 ${cm.avg_score}` : ""}
              </span>
              <div style={{ marginTop: 8 }}>
                {(cm.top_pros?.length ?? 0) > 0 && (
                  <div>
                    <Typography.Text type="success">优点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {cm.top_pros.map((p, i) => (
                        <li key={i}>{p.text} ×{p.count}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {(cm.top_cons?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="danger">缺点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {cm.top_cons.map((c, i) => (
                        <li key={i}>{c.text} ×{c.count}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </>
      )}

      {data.agent_vs_comparison && data.agent_vs_comparison.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#13c2c2" }}>Agent 对比通用大模型</Typography.Title>
          <ul style={{ paddingLeft: 20 }}>
            {data.agent_vs_comparison.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {data.takeaways_from_comparison && data.takeaways_from_comparison.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#2f54eb" }}>借鉴通用大模型的可取之处</Typography.Title>
          <Typography.Paragraph type="secondary">通用大模型回答中可供 Agent 借鉴的优点与改进方向</Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {data.takeaways_from_comparison.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {data.comparison_reverse_validation && data.comparison_reverse_validation.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#eb2f96" }}>通用大模型反向验证</Typography.Title>
          <Typography.Paragraph type="secondary">
            使用通用大模型的返回结果反向验证 Agent 的回复，识别要点缺失并给出优化建议
          </Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {data.comparison_reverse_validation.map((s, i) => (
              <li key={i} style={s.startsWith("【") ? { listStyle: "none", fontWeight: 600, marginTop: i > 0 ? 12 : 0 } : {}}>
                {s}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.prompt_optimization_by_agent && data.prompt_optimization_by_agent.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, color: "#1890ff" }}>Langfuse Prompt 优化建议</Typography.Title>
          <Typography.Paragraph type="secondary">
            从 Langfuse 读取的 Agent 关联 Prompt 文件，结合评测反馈给出的针对性优化建议
          </Typography.Paragraph>
          {data.prompt_optimization_by_agent.map((item, idx) => (
            <Card key={idx} size="small" style={{ marginTop: 12 }}>
              <Typography.Text strong>{item.agent_name}</Typography.Text>
              <span style={{ color: "#999", marginLeft: 8 }}>Prompt: {item.prompt_id}</span>
              {item.prompt_version && (
                <span style={{ color: "#999", marginLeft: 4 }}>v{item.prompt_version}</span>
              )}
              {item.content_preview && (
                <div style={{ marginTop: 8, padding: 8, background: "#fafafa", borderRadius: 4, fontSize: 13 }}>
                  <Typography.Text type="secondary">内容摘要：</Typography.Text>
                  <div style={{ whiteSpace: "pre-wrap", marginTop: 4 }}>{item.content_preview}</div>
                </div>
              )}
              {item.suggestions?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Typography.Text strong>优化建议：</Typography.Text>
                  <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                    {item.suggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </>
      )}

      {data.total_evaluations === 0 && (
        <div style={{ color: "#999", padding: 24, textAlign: "center" }}>暂无评测数据，无法生成总结报告</div>
      )}
    </div>
  );

  const summaryContent = !taskFilter ? (
    <div style={{ padding: "16px 20px", background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, color: "#389e0d" }}>
      请从右侧「筛选任务」下拉框中选择一个具体任务（勿选「全部任务」），即可查看该任务的批次总结报告
    </div>
  ) : summaryLoading ? (
    <div style={{ padding: 24, textAlign: "center" }}><Spin tip="加载总结报告中..." /></div>
  ) : summaryData ? (
    <div style={{ maxHeight: 400, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          整批次汇总：共 {summaryData.total_evaluations} 条评测
        </Typography.Paragraph>
        <span
          style={{ color: "#1677ff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          onClick={() => setSummaryModalOpen(true)}
        >
          <FullscreenOutlined /> 查看完整报告
        </span>
      </div>
      {summaryData.overall_top_pros?.length > 0 && (
        <><Typography.Text strong style={{ color: "#52c41a" }}>高频优点 </Typography.Text>
        <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
          {summaryData.overall_top_pros.slice(0, 5).map((p, i) => (
            <li key={i}>{p.text} <Typography.Text type="secondary">×{p.count}</Typography.Text></li>
          ))}
        </ul></>
      )}
      {summaryData.overall_top_cons?.length > 0 && (
        <><Typography.Text strong style={{ color: "#ff4d4f" }}>高频缺点 </Typography.Text>
        <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
          {summaryData.overall_top_cons.slice(0, 5).map((c, i) => (
            <li key={i}>{c.text} <Typography.Text type="secondary">×{c.count}</Typography.Text></li>
          ))}
        </ul></>
      )}
      {summaryData.agent_development_suggestions?.length > 0 && (
        <><Typography.Text strong style={{ color: "#722ed1" }}>Agent 开发优化建议 </Typography.Text>
        <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
          {summaryData.agent_development_suggestions.slice(0, 3).map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul></>
      )}
      {summaryData.total_evaluations === 0 && (
        <div style={{ color: "#999", padding: 24, textAlign: "center" }}>暂无评测数据，无法生成总结报告</div>
      )}
    </div>
  ) : (
    <div style={{ color: "#999", padding: 24, textAlign: "center" }}>暂无总结数据</div>
  );

  return (
    <MainLayout>
      <div>
      <Card
        title={
          <span>
            <FileTextOutlined style={{ marginRight: 8 }} />
            批次总结报告
          </span>
        }
        extra={
          <span style={{ display: "flex", gap: 8 }}>
            <Select
              placeholder={T.filterTask}
              allowClear
              style={{ width: 200 }}
              value={taskFilter || undefined}
              onChange={(v) => setTaskFilter(v === "" || v === "__all__" ? undefined : v)}
              options={[
                { value: "__all__", label: T.allTasks },
                ...tasks.map((t) => ({ value: t.id, label: t.name })),
              ]}
            />
            {taskFilter && (
              <Select
                placeholder={T.filterRun}
                allowClear
                style={{ width: 200 }}
                value={runFilter ?? ""}
                onChange={(v) => setRunFilter(v || undefined)}
                options={[
                  { value: "", label: T.latestRun },
                  ...taskRuns.map((r) => ({
                    value: r.id,
                    label: `${r.id.slice(-8)} ${r.status}`,
                  })),
                ]}
              />
            )}
          </span>
        }
        style={{ marginBottom: 16 }}
      >
        {summaryContent}
        <Table
          loading={loading}
          dataSource={data}
          rowKey="id"
          pagination={false}
          expandable={{
            expandedRowKeys,
            onExpand,
            expandedRowRender,
            rowExpandable: (record) => !!(record.task_id && record.agent_version_id),
          }}
          columns={[
            {
              title: T.rank,
              key: "rank",
              render: (_: unknown, __: LeaderboardEntry, index: number) => index + 1,
            },
            { title: "Agent", dataIndex: "agent_name", key: "agent_name" },
            {
              title: T.taskId,
              dataIndex: "task_id",
              key: "task_id",
              ellipsis: true,
            },
            {
              title: T.avgScore,
              dataIndex: "avg_score",
              key: "avg_score",
              render: (v: number) => (v != null ? v.toFixed(2) : "-"),
            },
            {
              title: "ELO",
              dataIndex: "elo",
              key: "elo",
              render: (v: number) => (v != null ? Math.round(v) : "-"),
            },
            {
              title: T.evalCount,
              dataIndex: "evaluation_count",
              key: "evaluation_count",
            },
          ]}
        />
      </Card>

      <Modal
        title={summaryData ? `总结报告 - ${summaryData.task_name}` : "总结报告"}
        open={summaryModalOpen}
        onCancel={() => setSummaryModalOpen(false)}
        footer={null}
        width={720}
      >
        {summaryData ? renderFullSummary(summaryData) : null}
      </Modal>
      </div>
    </MainLayout>
  );
}
