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
import SummaryReportDetail from "@/components/SummaryReportDetail";
import { apiGet, apiPost, apiDelete } from "@/api/client";
import type { SummaryReport } from "@/types/summaryReport";

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
          <SummaryReportDetail data={summaryData} />
        ) : null}
      </Modal>
    </MainLayout>
  );
}
