"use client";

import { useEffect, useState } from "react";
import { Table, Card, Select, message, Spin } from "antd";
import MainLayout from "@/components/MainLayout";
import { apiGet } from "@/api/client";

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

  return (
    <MainLayout>
      <Card
        title={T.leaderboard}
        extra={
          <span style={{ display: "flex", gap: 8 }}>
            <Select
              placeholder={T.filterTask}
              allowClear
              style={{ width: 200 }}
              value={taskFilter}
              onChange={setTaskFilter}
              options={[
                { value: "", label: T.allTasks },
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
      >
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
    </MainLayout>
  );
}
