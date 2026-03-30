"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Row,
  Col,
  Tooltip,
  Alert,
} from "antd";
import { ReloadOutlined, CloudServerOutlined, InboxOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import MainLayout from "@/components/MainLayout";
import { apiGet } from "@/api/client";

interface WorkerMonitorJob {
  job_id?: string | null;
  job_type?: string | null;
  task_id?: string | null;
  task_run_id?: string | null;
  total_evaluations?: number | null;
  agent_version_id?: string | null;
  compare_model?: string | null;
  batch_testcase_count?: number | null;
}

interface WorkerMonitorItem {
  worker_id: string;
  hostname?: string | null;
  pid?: number | null;
  started_at?: string | null;
  last_seen?: string | null;
  state: string;
  job?: WorkerMonitorJob | null;
  batch_index?: number | null;
  batch_total?: number | null;
  task_name?: string | null;
  executor_label?: string | null;
  total_evaluations?: number | null;
  completed_evaluations?: number | null;
}

interface WorkerMonitorResponse {
  queue_pending_jobs: number;
  workers: WorkerMonitorItem[];
}

const jobTypeLabel = (t: string | null | undefined) => {
  if (!t) return "";
  const m: Record<string, string> = {
    agent_batch: "Agent 批次",
    comparison_batch: "对比批次",
    agent: "Agent 单条",
    comparison: "对比单条",
  };
  return m[t] || t;
};

function formatHeartbeat(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
    return d.toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return iso.slice(0, 19);
  }
}

function shortWorkerId(id: string, max = 22): string {
  if (id.length <= max) return id;
  return `${id.slice(0, max - 1)}…`;
}

export default function WorkersPage() {
  const [data, setData] = useState<WorkerMonitorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<WorkerMonitorResponse>("/api/workers/monitor");
      setData(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const queueN = data?.queue_pending_jobs;
  const onlineN = data?.workers?.length ?? 0;

  const columns: ColumnsType<WorkerMonitorItem> = useMemo(
    () => [
      {
        title: "Worker",
        key: "worker",
        fixed: "left",
        width: 168,
        render: (_, r) => {
          const sub = [r.hostname, r.pid != null ? `pid ${r.pid}` : null].filter(Boolean).join(" · ") || "—";
          return (
            <div style={{ minWidth: 0 }}>
              <Tooltip title={r.worker_id}>
                <Typography.Text
                  code
                  copyable={{ text: r.worker_id, tooltips: ["复制 ID", "已复制"] }}
                  style={{ fontSize: 12, display: "block", wordBreak: "break-all" }}
                >
                  {shortWorkerId(r.worker_id)}
                </Typography.Text>
              </Tooltip>
              <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                {sub}
              </Typography.Text>
            </div>
          );
        },
      },
      {
        title: "状态",
        dataIndex: "state",
        width: 88,
        align: "center",
        render: (s: string) =>
          s === "busy" ? <Tag color="processing">执行中</Tag> : <Tag>空闲</Tag>,
      },
      {
        title: "当前任务 / 执行单元",
        key: "work",
        width: 240,
        ellipsis: true,
        render: (_, r) => {
          const task =
            r.task_name || (r.state === "busy" ? "（任务不存在或已删除）" : "—");
          const exec = r.executor_label || "—";
          const jt = jobTypeLabel(r.job?.job_type);
          return (
            <div style={{ minWidth: 0 }}>
              <Typography.Text ellipsis={{ tooltip: task }} style={{ display: "block", fontWeight: 500 }}>
                {task}
              </Typography.Text>
              <Space size={4} wrap style={{ marginTop: 4 }}>
                <Typography.Text type="secondary" ellipsis={{ tooltip: exec }} style={{ fontSize: 12, maxWidth: 200 }}>
                  {exec}
                </Typography.Text>
                {jt ? (
                  <Tag bordered={false} color="blue" style={{ margin: 0, fontSize: 11, lineHeight: "18px" }}>
                    {jt}
                  </Tag>
                ) : null}
              </Space>
            </div>
          );
        },
      },
      {
        title: "评测进度",
        key: "progress",
        width: 108,
        align: "right",
        render: (_, r) => {
          const total = r.total_evaluations;
          const done = r.completed_evaluations;
          const hasPair = total != null && done != null;
          const batch =
            r.batch_index != null && r.batch_total != null
              ? `批次 ${r.batch_index} / ${r.batch_total}`
              : null;
          return (
            <Tooltip title="已完成评测条数 / 本 run 总条数（含 Agent 与对比模型）">
              <div style={{ textAlign: "right" }}>
                <div style={{ fontVariantNumeric: "tabular-nums" }}>
                  {hasPair ? `${done} / ${total}` : "—"}
                </div>
                {batch ? (
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: "block", marginTop: 2 }}>
                    {batch}
                  </Typography.Text>
                ) : null}
              </div>
            </Tooltip>
          );
        },
      },
      {
        title: "最近心跳",
        dataIndex: "last_seen",
        width: 132,
        ellipsis: true,
        render: (v: string | null | undefined) => (
          <Tooltip title={v || ""}>
            <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>{formatHeartbeat(v)}</span>
          </Tooltip>
        ),
      },
    ],
    [],
  );

  return (
    <MainLayout>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          width: "100%",
          minWidth: 0,
        }}
      >
        <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>
          Worker 监控
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 20, maxWidth: 720 }}>
          与 API 共用同一 Redis 的 Worker 会每约 15 秒上报心跳；超过约 60 秒无心跳将从列表消失。队列长度为待处理的{" "}
          <Typography.Text code>batch job</Typography.Text> 个数（非单条 testcase）。
        </Typography.Paragraph>

        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={24} sm={12}>
            <Card
              size="small"
              variant="borderless"
              style={{
                background: "linear-gradient(135deg, #f6ffed 0%, #f9fafb 100%)",
                border: "1px solid #d9f7be",
                borderRadius: 10,
              }}
            >
              <Space align="start" size={12}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "#52c41a",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  <CloudServerOutlined />
                </span>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    在线 Worker
                  </Typography.Text>
                  <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                    {onlineN}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
          <Col xs={24} sm={12}>
            <Card
              size="small"
              variant="borderless"
              style={{
                background: "linear-gradient(135deg, #e6f4ff 0%, #f9fafb 100%)",
                border: "1px solid #91caff",
                borderRadius: 10,
              }}
            >
              <Space align="start" size={12}>
                <span
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: "#1677ff",
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 18,
                    flexShrink: 0,
                  }}
                >
                  <InboxOutlined />
                </span>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    队列待处理 job
                  </Typography.Text>
                  <div style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
                    {queueN ?? "—"}
                  </div>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>

        <Card
          variant="borderless"
          style={{
            borderRadius: 12,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)",
            border: "1px solid #f0f0f0",
          }}
          styles={{ body: { padding: "16px 16px 8px" } }}
          extra={
            <Button type="primary" ghost icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
              刷新
            </Button>
          }
          title={<span style={{ fontWeight: 600 }}>Worker 列表</span>}
        >
          {error ? (
            <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />
          ) : null}

          <div
            style={{
              width: "100%",
              maxWidth: "100%",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              borderRadius: 8,
              border: "1px solid #f0f0f0",
            }}
          >
            <Table<WorkerMonitorItem>
              rowKey="worker_id"
              loading={loading}
              columns={columns}
              dataSource={data?.workers || []}
              pagination={false}
              size="middle"
              tableLayout="fixed"
              scroll={{ x: 740 }}
              locale={{
                emptyText: "当前无在线 Worker（请启动 agentarena-worker 并确认 Redis 与 API 一致）",
              }}
            />
          </div>
          <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
            表格较宽时可在区域内横向滑动；Worker ID 悬停可看完整内容，点击复制图标可复制。
          </Typography.Paragraph>
        </Card>
      </div>
    </MainLayout>
  );
}
