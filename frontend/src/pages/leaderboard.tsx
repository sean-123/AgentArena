"use client";

import React, { useEffect, useState } from "react";
import { Table, Card, Select, message, Spin, Typography } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet } from "@/api/client";

interface TopItem {
  text: string;
  count: number;
}

interface OptimizationByCategory {
  answer_modification: string[];
  prompt_optimization: string[];
  rag_optimization: string[];
  agent_development?: string[];
}

interface SummaryReport {
  task_id: string;
  task_run_id: string | null;
  task_name: string;
  total_evaluations: number;
  overall_top_pros: TopItem[];
  overall_top_cons: TopItem[];
  overall_optimization: OptimizationByCategory | null;
  agent_development_suggestions: string[];
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

  const summaryContent = !taskFilter ? (
    <div style={{ padding: "16px 20px", background: "#f6ffed", border: "1px solid #b7eb8f", borderRadius: 8, color: "#389e0d" }}>
      请从右侧「筛选任务」下拉框中选择一个具体任务（勿选「全部任务」），即可查看该任务的批次总结报告
    </div>
  ) : summaryLoading ? (
    <div style={{ padding: 24, textAlign: "center" }}><Spin tip="加载总结报告中..." /></div>
  ) : summaryData ? (
    <div style={{ maxHeight: 400, overflow: "auto" }}>
      <Typography.Paragraph type="secondary">整批次汇总：高频优缺点、调整建议、Agent 开发优化建议</Typography.Paragraph>
      {summaryData.overall_top_pros?.length > 0 && (
        <><Typography.Text strong style={{ color: "#52c41a" }}>高频优点 </Typography.Text>
        <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
          {summaryData.overall_top_pros.map((p, i) => (
            <li key={i}>{p.text} <Typography.Text type="secondary">×{p.count}</Typography.Text></li>
          ))}
        </ul></>
      )}
      {summaryData.overall_top_cons?.length > 0 && (
        <><Typography.Text strong style={{ color: "#ff4d4f" }}>高频缺点 </Typography.Text>
        <ul style={{ paddingLeft: 20, margin: "4px 0 12px" }}>
          {summaryData.overall_top_cons.map((c, i) => (
            <li key={i}>{c.text} <Typography.Text type="secondary">×{c.count}</Typography.Text></li>
          ))}
        </ul></>
      )}
      {summaryData.overall_optimization &&
        ((summaryData.overall_optimization.answer_modification?.length ?? 0) > 0 ||
          (summaryData.overall_optimization.prompt_optimization?.length ?? 0) > 0 ||
          (summaryData.overall_optimization.rag_optimization?.length ?? 0) > 0 ||
          (summaryData.overall_optimization.agent_development?.length ?? 0) > 0) && (
        <>
          <Typography.Text strong style={{ color: "#1890ff" }}>调整建议汇总 </Typography.Text>
          {summaryData.overall_optimization.answer_modification?.map((s, i) => (
            <div key={i} style={{ marginTop: 8 }}><Typography.Text type="secondary">回答修改：</Typography.Text>
              <ul style={{ paddingLeft: 20, margin: "2px 0" }}><li>{s}</li></ul>
            </div>
          ))}
          {summaryData.overall_optimization.prompt_optimization?.map((s, i) => (
            <div key={i} style={{ marginTop: 8 }}><Typography.Text type="secondary">提示词：</Typography.Text>
              <ul style={{ paddingLeft: 20, margin: "2px 0" }}><li>{s}</li></ul>
            </div>
          ))}
          {summaryData.overall_optimization.rag_optimization?.map((s, i) => (
            <div key={i} style={{ marginTop: 8 }}><Typography.Text type="secondary">RAG/知识库：</Typography.Text>
              <ul style={{ paddingLeft: 20, margin: "2px 0" }}><li>{s}</li></ul>
            </div>
          ))}
          {summaryData.overall_optimization.agent_development?.map((s, i) => (
            <div key={i} style={{ marginTop: 8 }}><Typography.Text type="secondary">Agent 架构/模型：</Typography.Text>
              <ul style={{ paddingLeft: 20, margin: "2px 0" }}><li>{s}</li></ul>
            </div>
          ))}
        </>
      )}
      {summaryData.agent_development_suggestions?.length > 0 && (
        <><Typography.Title level={5} style={{ marginTop: 16, color: "#722ed1" }}>Agent 开发优化建议</Typography.Title>
        <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
          {summaryData.agent_development_suggestions.map((s, i) => (
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
      </div>
    </MainLayout>
  );
}
