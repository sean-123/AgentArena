"use client";

import { useEffect, useState, useRef } from "react";
import {
  Table,
  Button,
  Space,
  Card,
  message,
  Modal,
  Form,
  Input,
  Select,
  Drawer,
  Progress,
  Descriptions,
  Spin,
  Typography,
  Collapse,
  Tag,
  Checkbox,
  Tabs,
} from "antd";
import { PlusOutlined, PlayCircleOutlined, EyeOutlined, FileTextOutlined } from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet, apiPost, apiDelete } from "@/api/client";

interface Task {
  id: string;
  name: string;
  dataset_id: string | null;
  dataset_version_id: string | null;
  agent_ids: string | null;
  status: string;
  created_at: string;
}

interface EvLog {
  id: string;
  agent_version_id?: string;
  model_type?: string;
  question: string;
  answer: string;
  latency?: number;
  created_at?: string;
}

interface WorkerSlot {
  slot_id: string;
  label: string;
  total: number;
  completed: number;
  percent: number;
}

interface WorkerLogSlot {
  slot_id: string;
  label: string;
  logs: EvLog[];
}

interface TaskDetail {
  task: Task;
  latest_run?: {
    id: string;
    status: string;
    total_jobs?: number;
    created_at?: string;
  };
  progress: { total: number; completed: number; percent: number };
  config: { dataset_name?: string; agent_names?: string[] };
  evaluations: EvLog[];
  progress_by_worker?: WorkerSlot[];
  evaluations_by_worker?: WorkerLogSlot[];
}

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

interface PromptOptimizationItem {
  agent_version_id: string;
  agent_name: string;
  prompt_id: string;
  prompt_version: string;
  content_preview: string;
  suggestions: string[];
}

interface SummaryReport {
  task_id: string;
  task_run_id: string | null;
  task_name: string;
  total_evaluations: number;
  by_agent: AgentSummary[];
  overall_top_pros: TopItem[];
  overall_top_cons: TopItem[];
  overall_optimization: OptimizationByCategory | null;
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

interface Dataset {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
}

/** 执行日志中单条回答：超过预览长度时显示「更多 / 收起」 */
const LOG_ANSWER_PREVIEW_LEN = 200;

function ExecutionLogAnswer({ answer }: { answer: string }) {
  const [expanded, setExpanded] = useState(false);
  const needToggle = answer.length > LOG_ANSWER_PREVIEW_LEN;
  const shown = expanded || !needToggle ? answer : answer.slice(0, LOG_ANSWER_PREVIEW_LEN);
  return (
    <div style={{ marginTop: 4 }}>
      <strong>答：</strong>
      <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{shown}</span>
      {needToggle && (
        <Button
          type="link"
          size="small"
          style={{ padding: "0 4px", height: "auto", verticalAlign: "baseline", fontSize: 12 }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收起" : "更多"}
        </Button>
      )}
    </div>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<SummaryReport | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [form] = Form.useForm();

  const loadTasks = async () => {
    try {
      const data = await apiGet<Task[]>("/api/tasks");
      setTasks(data);
    } catch (e) {
      message.error("加载任务失败: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadDatasets = async () => {
    try {
      const data = await apiGet<Dataset[]>("/api/datasets");
      setDatasets(data);
    } catch {
      setDatasets([]);
    }
  };

  const loadAgents = async () => {
    try {
      const data = await apiGet<Agent[]>("/api/agents");
      setAgents(data);
    } catch {
      setAgents([]);
    }
  };

  useEffect(() => {
    loadTasks();
    loadDatasets();
    loadAgents();
  }, []);

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      await apiPost("/api/tasks", {
        name: vals.name,
        dataset_id: vals.dataset_id || undefined,
        dataset_version_id: vals.dataset_version_id || undefined,
        agent_ids: vals.agent_ids?.length ? vals.agent_ids : undefined,
        compare_model_ids: vals.compare_model_ids?.length ? vals.compare_model_ids : undefined,
      });
      message.success("任务创建成功");
      setModalOpen(false);
      form.resetFields();
      loadTasks();
    } catch (e) {
      message.error("创建失败: " + (e as Error).message);
    }
  };

  const handleRun = async (task: Task) => {
    try {
      await apiPost(`/api/evaluation/tasks/${task.id}/run`, {});
      message.success("评估已提交，Worker 将在后台执行");
      loadTasks();
    } catch (e) {
      message.error("启动失败: " + (e as Error).message);
    }
  };

  const handleDelete = async (task: Task) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定删除任务「${task.name}」？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      async onOk() {
        await apiDelete(`/api/tasks/${task.id}`);
        message.success("已删除");
        loadTasks();
      },
    });
  };

  const statusMap: Record<string, string> = {
    pending: "待运行",
    running: "运行中",
    completed: "已完成",
    failed: "失败",
  };

  const loadTaskDetail = async (taskId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setDetailLoading(true);
    try {
      const data = await apiGet<TaskDetail>(`/api/tasks/${taskId}/detail`);
      setDetail(data);
      return data;
    } catch (e) {
      if (!options?.silent) message.error("加载详情失败: " + (e as Error).message);
    } finally {
      if (!options?.silent) setDetailLoading(false);
    }
  };

  const openDetail = (task: Task) => {
    setDetailTaskId(task.id);
    setDetailDrawerOpen(true);
    setDetail(null);
    loadTaskDetail(task.id).then((d) => {
      // 运行中或待运行均启动轮询，以便进度实时更新
      const shouldPoll = d?.task?.status === "running" || d?.task?.status === "pending";
      if (shouldPoll) {
        pollRef.current = setInterval(() => {
          loadTaskDetail(task.id, { silent: true }).then((r) => {
            if (r) setDetail(r);
            if (r?.task?.status !== "running" && r?.task?.status !== "pending") {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              loadTasks();
            }
          });
        }, 1500);
      }
    });
  };

  const closeDetail = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setDetailDrawerOpen(false);
    setDetailTaskId(null);
    setDetail(null);
    setSummaryModalOpen(false);
    setSummaryData(null);
    loadTasks();
  };

  const openSummaryReport = async () => {
    if (!detailTaskId || !detail?.latest_run?.id) return;
    setSummaryModalOpen(true);
    setSummaryData(null);
    setSummaryLoading(true);
    try {
      const data = await apiGet<SummaryReport>(
        `/api/reports/summary?task_id=${detailTaskId}&task_run_id=${detail.latest_run.id}`
      );
      setSummaryData(data);
    } catch (e) {
      message.error("加载总结报告失败: " + (e as Error).message);
      setSummaryModalOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleForceComplete = async () => {
    if (!detailTaskId) return;
    try {
      await apiPost(`/api/tasks/${detailTaskId}/force-complete`, {});
      message.success("已强制标记为已完成");
      loadTaskDetail(detailTaskId);
      loadTasks();
    } catch (e) {
      message.error("操作失败: " + (e as Error).message);
    }
  };

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return (
    <MainLayout>
      <Card
        title="评估任务"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            创建任务
          </Button>
        }
      >
        <Table
          loading={loading}
          dataSource={tasks}
          rowKey="id"
          columns={[
            { title: "任务名称", dataIndex: "name", key: "name" },
            {
              title: "状态",
              dataIndex: "status",
              key: "status",
              render: (s: string) => statusMap[s] || s,
            },
            {
              title: "创建时间",
              dataIndex: "created_at",
              key: "created_at",
              render: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
            },
            {
              title: "操作",
              key: "actions",
              render: (_, record: Task) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openDetail(record)}
                  >
                    查看详情
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlayCircleOutlined />}
                    disabled={record.status === "running"}
                    onClick={() => handleRun(record)}
                  >
                    运行
                  </Button>
                  <Button size="small" danger onClick={() => handleDelete(record)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="创建评估任务"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: "请输入任务名称" }]}
          >
            <Input placeholder="如：客服问答评估" />
          </Form.Item>
          <Form.Item
            name="dataset_id"
            label="数据集"
            rules={[{ required: true, message: "请选择数据集" }]}
          >
            <Select
              allowClear
              placeholder="选择数据集（可选）"
              options={datasets.map((d) => ({ label: d.name, value: d.id }))}
            />
          </Form.Item>
          <Form.Item name="agent_ids" label="参与 Agent">
            <Select
              mode="multiple"
              allowClear
              placeholder="选择要评估的 Agent（不选则评估全部）"
              options={agents.map((a) => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
          <Form.Item name="compare_model_ids" label="对比通用大模型（可选）">
            <Checkbox.Group
              options={[
                { label: "豆包 DouBao", value: "doubao" },
                { label: "通义千问 Qwen", value: "qwen" },
                { label: "DeepSeek", value: "deepseek" },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={detail?.task?.name ? `任务详情 - ${detail.task.name}` : "任务详情"}
        placement="right"
        width={640}
        open={detailDrawerOpen}
        onClose={closeDetail}
      >
        {detailLoading && !detail ? (
          <Spin tip="加载中..." />
        ) : detail ? (
          <div>
            <Typography.Title level={5}>任务配置</Typography.Title>
            <Descriptions column={1} size="small">
              <Descriptions.Item label="任务名称">{detail.task.name}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusMap[detail.task.status] || detail.task.status}</Descriptions.Item>
              <Descriptions.Item label="数据集">{detail.config?.dataset_name ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="参与 Agent">
                {detail.config?.agent_names?.length
                  ? detail.config.agent_names.join("、")
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="创建时间">
                {detail.task.created_at ? new Date(detail.task.created_at).toLocaleString() : "-"}
              </Descriptions.Item>
            </Descriptions>

            {detail.latest_run && (
              <>
                <Typography.Title level={5} style={{ marginTop: 28, marginBottom: 20 }}>
                  执行情况
                </Typography.Title>
                <div
                  style={{
                    padding: 28,
                    background: "#fafafa",
                    borderRadius: 12,
                    border: "1px solid #f0f0f0",
                  }}
                >
                  {/* 顶部：状态 + 总进度 */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 28,
                      marginBottom: 28,
                      padding: "20px 24px",
                      background: "#fff",
                      borderRadius: 10,
                      border: "1px solid #f0f0f0",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: "#8c8c8c", fontSize: 13 }}>运行状态</span>
                      <Tag color={detail.latest_run.status === "running" ? "processing" : "success"}>
                        {statusMap[detail.latest_run.status] ?? detail.latest_run.status}
                      </Tag>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ color: "#8c8c8c", fontSize: 13 }}>总进度</span>
                      <span style={{ fontWeight: 600, fontSize: 18, color: "#262626" }}>
                        {detail.progress?.completed ?? 0} / {detail.progress?.total ?? 0}
                      </span>
                      <span style={{ color: "#8c8c8c", fontSize: 13 }}>条</span>
                    </div>
                  </div>

                  {/* 各执行单元：卡片式，大间距 */}
                  {detail.progress_by_worker?.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                      {detail.progress_by_worker.map((slot) => (
                        <div
                          key={slot.slot_id}
                          style={{
                            padding: "20px 24px",
                            background: "#fff",
                            borderRadius: 10,
                            border: "1px solid #f0f0f0",
                            borderLeft: `4px solid ${slot.slot_id.startsWith("compare_") ? "#fa8c16" : "#1890ff"}`,
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: 14,
                            }}
                          >
                            <span style={{ fontWeight: 600, fontSize: 15, color: "#262626" }}>
                              {slot.label}
                            </span>
                            <span style={{ fontSize: 14, color: "#595959", fontWeight: 500 }}>
                              {slot.total > 0 ? (
                                <>{slot.completed} / {slot.total} 条</>
                              ) : (
                                <>{slot.completed} 条</>
                              )}
                            </span>
                          </div>
                          <Progress
                            percent={slot.total > 0 ? slot.percent : 0}
                            status={detail.task.status === "running" ? "active" : undefined}
                            strokeColor={slot.percent >= 100 ? "#52c41a" : undefined}
                            showInfo={slot.total > 0}
                            strokeWidth={10}
                            style={{ marginBottom: 0 }}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      style={{
                        padding: "16px 20px",
                        background: "#fff",
                        borderRadius: 10,
                        border: "1px solid #f0f0f0",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 12,
                        }}
                      >
                        <span style={{ fontWeight: 500, fontSize: 14 }}>整体进度</span>
                        <span style={{ fontSize: 13, color: "#595959" }}>
                          {detail.progress?.completed ?? 0} / {detail.progress?.total ?? 0} 条
                        </span>
                      </div>
                      <Progress
                        percent={detail.progress?.percent ?? 0}
                        status={detail.task.status === "running" ? "active" : undefined}
                        strokeColor={(detail.progress?.percent ?? 0) >= 100 ? "#52c41a" : undefined}
                      />
                    </div>
                  )}

                  {detail.task.status === "completed" && (
                    <div style={{ marginTop: 16 }}>
                      <Button
                        type="primary"
                        icon={<FileTextOutlined />}
                        onClick={openSummaryReport}
                        block
                        size="large"
                        style={{ height: 40, borderRadius: 8 }}
                      >
                        查看总结报告
                      </Button>
                    </div>
                  )}
                  {detail.task.status === "running" && (
                    <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
                      <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
                        若所有 Worker 已执行完毕但状态未更新，可点击强制完成以查看总结报告
                      </Typography.Text>
                      <Button type="default" danger onClick={handleForceComplete}>
                        强制完成
                      </Button>
                    </div>
                  )}
                </div>
              </>
            )}

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              执行日志
            </Typography.Title>
            {detail.evaluations_by_worker?.length ? (
              <Tabs
                defaultActiveKey={detail.evaluations_by_worker[0]?.slot_id}
                items={detail.evaluations_by_worker.map((slot) => ({
                  key: slot.slot_id,
                  label: `${slot.label} (${slot.logs?.length ?? 0})`,
                  children: (
                    <div
                      style={{
                        maxHeight: 320,
                        overflow: "auto",
                        background: "#f5f5f5",
                        padding: 12,
                        borderRadius: 8,
                        fontFamily: "monospace",
                        fontSize: 12,
                      }}
                    >
                      {slot.logs?.length ? (
                        slot.logs.map((ev) => (
                          <div
                            key={ev.id}
                            style={{
                              marginBottom: 12,
                              padding: 8,
                              background: "#fff",
                              borderRadius: 4,
                              borderLeft: "3px solid #1890ff",
                            }}
                          >
                            <div style={{ color: "#666", marginBottom: 4 }}>
                              [{ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : "-"}] 完成 1 条
                              {ev.latency != null ? ` · ${(ev.latency * 1000).toFixed(0)}ms` : ""}
                            </div>
                            <div>
                              <strong>问：</strong>
                              <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{ev.question}</span>
                            </div>
                            {ev.answer ? <ExecutionLogAnswer answer={ev.answer} /> : null}
                          </div>
                        ))
                      ) : (
                        <div style={{ color: "#999" }}>暂无执行记录</div>
                      )}
                    </div>
                  ),
                }))}
              />
            ) : (
              <div
                style={{
                  maxHeight: 320,
                  overflow: "auto",
                  background: "#f5f5f5",
                  padding: 12,
                  borderRadius: 8,
                  fontFamily: "monospace",
                  fontSize: 12,
                }}
              >
                {detail.evaluations?.length ? (
                  detail.evaluations.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        marginBottom: 12,
                        padding: 8,
                        background: "#fff",
                        borderRadius: 4,
                        borderLeft: "3px solid #1890ff",
                      }}
                    >
                      <div style={{ color: "#666", marginBottom: 4 }}>
                        [{ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : "-"}] 完成 1 条
                        {ev.latency != null ? ` · ${(ev.latency * 1000).toFixed(0)}ms` : ""}
                      </div>
                      <div>
                        <strong>问：</strong>
                        <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{ev.question}</span>
                      </div>
                      {ev.answer ? <ExecutionLogAnswer answer={ev.answer} /> : null}
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#999" }}>暂无执行记录</div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>暂无数据</div>
        )}
      </Drawer>

      <Modal
        title={summaryData ? `总结报告 - ${summaryData.task_name}` : "总结报告"}
        open={summaryModalOpen}
        onCancel={() => {
          setSummaryModalOpen(false);
          setSummaryData(null);
        }}
        footer={null}
        width={720}
      >
        {summaryLoading ? (
          <div style={{ padding: 48, textAlign: "center" }}>
            <Spin tip="生成报告中..." />
          </div>
        ) : summaryData ? (
          <div style={{ maxHeight: "70vh", overflow: "auto" }}>
            <Typography.Paragraph type="secondary">
              共 {summaryData.total_evaluations} 条评测，按 Agent 聚合优缺点与优化建议
            </Typography.Paragraph>

            {(summaryData.reply_quality_summary || summaryData.info_accuracy_summary || (summaryData.reply_experience_suggestions?.length ?? 0) > 0) && (
              <div style={{ marginTop: 16, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
                <Typography.Title level={5} style={{ marginTop: 0, color: "#1677ff" }}>
                  质量总评
                </Typography.Title>
                {summaryData.reply_quality_summary && (
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text strong>回复质量：</Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>{summaryData.reply_quality_summary}</Typography.Paragraph>
                  </div>
                )}
                {summaryData.info_accuracy_summary && (
                  <div style={{ marginBottom: 12 }}>
                    <Typography.Text strong>信息准确度：</Typography.Text>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>{summaryData.info_accuracy_summary}</Typography.Paragraph>
                  </div>
                )}
                {summaryData.reply_experience_suggestions?.length ? (
                  <div>
                    <Typography.Text strong>回复体验改进建议：</Typography.Text>
                    <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                      {summaryData.reply_experience_suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )}

            {(summaryData.overall_top_pros?.length ?? 0) > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#52c41a" }}>
                  全局高频优点
                </Typography.Title>
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  {summaryData.overall_top_pros.map((p, i) => (
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

            {(summaryData.overall_top_cons?.length ?? 0) > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#ff4d4f" }}>
                  全局高频缺点
                </Typography.Title>
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  {summaryData.overall_top_cons.map((c, i) => (
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

            {summaryData.overall_optimization &&
              ((summaryData.overall_optimization.answer_modification?.length ?? 0) > 0 ||
                (summaryData.overall_optimization.prompt_optimization?.length ?? 0) > 0 ||
                (summaryData.overall_optimization.rag_optimization?.length ?? 0) > 0 ||
                (summaryData.overall_optimization.agent_development?.length ?? 0) > 0) && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#1890ff" }}>
                  优化建议汇总
                </Typography.Title>
                {(summaryData.overall_optimization.answer_modification?.length ?? 0) > 0 && (
                  <>
                    <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                      回答修改建议
                    </Typography.Text>
                    <ul style={{ paddingLeft: 20 }}>
                      {summaryData.overall_optimization.answer_modification.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {(summaryData.overall_optimization.prompt_optimization?.length ?? 0) > 0 && (
                  <>
                    <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                      提示词优化
                    </Typography.Text>
                    <ul style={{ paddingLeft: 20 }}>
                      {summaryData.overall_optimization.prompt_optimization.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {(summaryData.overall_optimization.rag_optimization?.length ?? 0) > 0 && (
                  <>
                    <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                      RAG 相关优化
                    </Typography.Text>
                    <ul style={{ paddingLeft: 20 }}>
                      {summaryData.overall_optimization.rag_optimization.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
                {(summaryData.overall_optimization.agent_development?.length ?? 0) > 0 && (
                  <>
                    <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                      Agent 架构/模型优化
                    </Typography.Text>
                    <ul style={{ paddingLeft: 20 }}>
                      {(summaryData.overall_optimization.agent_development ?? []).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            {(summaryData.agent_development_suggestions?.length ?? 0) > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#722ed1" }}>
                  Agent 开发优化建议
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  基于整批次评测提炼的开发方向与优化建议
                </Typography.Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  {(summaryData.agent_development_suggestions ?? []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {(summaryData.by_agent?.length ?? 0) > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  各 Agent 详情
                </Typography.Title>
                {summaryData.by_agent.map((ag) => (
                  <Card key={ag.agent_version_id} size="small" style={{ marginBottom: 12 }}>
                    <Typography.Text strong>{ag.agent_name}</Typography.Text>
                    <span style={{ color: "#999", marginLeft: 8 }}>
                      {ag.evaluation_count} 条评测
                    </span>
                    <div style={{ marginTop: 8 }}>
                      {(ag.top_pros?.length ?? 0) > 0 && (
                        <div>
                          <Typography.Text type="success">优点：</Typography.Text>
                          <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                            {ag.top_pros.map((p, i) => (
                              <li key={i}>
                                {p.text}
                                <span style={{ color: "#999" }}> ×{p.count}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {(ag.top_cons?.length ?? 0) > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <Typography.Text type="danger">缺点：</Typography.Text>
                          <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                            {ag.top_cons.map((c, i) => (
                              <li key={i}>
                                {c.text}
                                <span style={{ color: "#999" }}> ×{c.count}</span>
                              </li>
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
                            <div key={`a-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>
                              · {s}
                            </div>
                          ))}
                          {ag.optimization.prompt_optimization?.map((s, i) => (
                            <div key={`p-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>
                              · [提示词] {s}
                            </div>
                          ))}
                          {ag.optimization.rag_optimization?.map((s, i) => (
                            <div key={`r-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>
                              · [RAG] {s}
                            </div>
                          ))}
                          {ag.optimization.agent_development?.map((s, i) => (
                            <div key={`d-${i}`} style={{ marginLeft: 8, fontSize: 13 }}>
                              · [Agent 开发] {s}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </>
            )}

            {summaryData.comparison_by_model && summaryData.comparison_by_model.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24, color: "#fa8c16" }}>
                  对比通用大模型
                </Typography.Title>
                {summaryData.comparison_by_model.map((cm) => (
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

            {summaryData.agent_vs_comparison && summaryData.agent_vs_comparison.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#13c2c2" }}>
                  Agent 对比通用大模型
                </Typography.Title>
                <ul style={{ paddingLeft: 20 }}>
                  {summaryData.agent_vs_comparison.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.takeaways_from_comparison && summaryData.takeaways_from_comparison.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#2f54eb" }}>
                  借鉴通用大模型的可取之处
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  通用大模型回答中可供 Agent 借鉴的优点与改进方向
                </Typography.Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  {summaryData.takeaways_from_comparison.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.comparison_reverse_validation && summaryData.comparison_reverse_validation.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#eb2f96" }}>
                  通用大模型反向验证
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  使用通用大模型的返回结果反向验证 Agent 的回复，识别要点缺失并给出优化建议
                </Typography.Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  {summaryData.comparison_reverse_validation.map((s, i) => (
                    <li key={i} style={s.startsWith("【") ? { listStyle: "none", fontWeight: 600, marginTop: i > 0 ? 12 : 0 } : {}}>
                      {s}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.prompt_optimization_by_agent && summaryData.prompt_optimization_by_agent.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 24, color: "#1890ff" }}>
                  Langfuse Prompt 优化建议
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  从 Langfuse 读取的 Agent 关联 Prompt 文件，结合评测反馈给出的针对性优化建议
                </Typography.Paragraph>
                {summaryData.prompt_optimization_by_agent.map((item, idx) => (
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

            {summaryData.total_evaluations === 0 && (
              <div style={{ color: "#999", padding: 24, textAlign: "center" }}>
                暂无评测数据，无法生成总结报告
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </MainLayout>
  );
}
