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
  evaluations: Array<{
    id: string;
    agent_version_id: string;
    question: string;
    answer: string;
    latency?: number;
    created_at?: string;
  }>;
}

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

interface AgentSummary {
  agent_name: string;
  agent_version_id: string;
  evaluation_count: number;
  top_pros: TopItem[];
  top_cons: TopItem[];
  optimization: OptimizationByCategory;
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
}

interface Dataset {
  id: string;
  name: string;
}

interface Agent {
  id: string;
  name: string;
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

  const loadTaskDetail = async (taskId: string) => {
    setDetailLoading(true);
    try {
      const data = await apiGet<TaskDetail>(`/api/tasks/${taskId}/detail`);
      setDetail(data);
      return data;
    } catch (e) {
      message.error("加载详情失败: " + (e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  };

  const openDetail = (task: Task) => {
    setDetailTaskId(task.id);
    setDetailDrawerOpen(true);
    setDetail(null);
    loadTaskDetail(task.id).then((d) => {
      if (d?.task?.status === "running") {
        pollRef.current = setInterval(() => {
          loadTaskDetail(task.id).then((r) => {
            if (r?.task?.status !== "running") {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
              loadTasks();
            }
          });
        }, 2000);
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
                <Typography.Title level={5} style={{ marginTop: 24 }}>
                  执行情况
                </Typography.Title>
                <Descriptions column={1} size="small">
                  <Descriptions.Item label="本次运行">
                    {statusMap[detail.latest_run.status] ?? detail.latest_run.status}
                  </Descriptions.Item>
                  <Descriptions.Item label="进度">
                    <Progress
                      percent={detail.progress?.percent ?? 0}
                      status={detail.task.status === "running" ? "active" : undefined}
                    />
                    <span style={{ fontSize: 12, color: "#666" }}>
                      {detail.progress?.completed ?? 0} / {detail.progress?.total ?? 0} 条
                    </span>
                  </Descriptions.Item>
                  {detail.task.status === "completed" && (
                    <Descriptions.Item>
                      <Button
                        type="primary"
                        icon={<FileTextOutlined />}
                        onClick={openSummaryReport}
                      >
                        查看总结报告
                      </Button>
                    </Descriptions.Item>
                  )}
                </Descriptions>
              </>
            )}

            <Typography.Title level={5} style={{ marginTop: 24 }}>
              执行日志
            </Typography.Title>
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
                detail.evaluations.map((ev, i) => (
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
                      {ev.question}
                      {ev.question?.length >= 200 ? "…" : ""}
                    </div>
                    {ev.answer && (
                      <div style={{ marginTop: 4 }}>
                        <strong>答：</strong>
                        {ev.answer}
                        {ev.answer.length >= 200 ? "…" : ""}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ color: "#999" }}>暂无执行记录</div>
              )}
            </div>
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

            {summaryData.overall_top_pros?.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#52c41a" }}>
                  全局高频优点
                </Typography.Title>
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  {summaryData.overall_top_pros.map((p, i) => (
                    <li key={i}>
                      {p.text}
                      <span style={{ color: "#999", marginLeft: 8 }}>×{p.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.overall_top_cons?.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#ff4d4f" }}>
                  全局高频缺点
                </Typography.Title>
                <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
                  {summaryData.overall_top_cons.map((c, i) => (
                    <li key={i}>
                      {c.text}
                      <span style={{ color: "#999", marginLeft: 8 }}>×{c.count}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.overall_optimization &&
              (summaryData.overall_optimization.answer_modification?.length > 0 ||
                summaryData.overall_optimization.prompt_optimization?.length > 0 ||
                summaryData.overall_optimization.rag_optimization?.length > 0 ||
                summaryData.overall_optimization.agent_development?.length > 0) && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#1890ff" }}>
                  优化建议汇总
                </Typography.Title>
                {summaryData.overall_optimization.answer_modification?.length > 0 && (
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
                {summaryData.overall_optimization.prompt_optimization?.length > 0 && (
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
                {summaryData.overall_optimization.rag_optimization?.length > 0 && (
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
                {summaryData.overall_optimization.agent_development?.length > 0 && (
                  <>
                    <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                      Agent 架构/模型优化
                    </Typography.Text>
                    <ul style={{ paddingLeft: 20 }}>
                      {summaryData.overall_optimization.agent_development.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            {summaryData.agent_development_suggestions?.length > 0 && (
              <>
                <Typography.Title level={5} style={{ marginTop: 16, color: "#722ed1" }}>
                  Agent 开发优化建议
                </Typography.Title>
                <Typography.Paragraph type="secondary">
                  基于整批次评测提炼的开发方向与优化建议
                </Typography.Paragraph>
                <ul style={{ paddingLeft: 20 }}>
                  {summaryData.agent_development_suggestions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}

            {summaryData.by_agent?.length > 0 && (
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
                      {ag.top_pros?.length > 0 && (
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
                      {ag.top_cons?.length > 0 && (
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
                      {(ag.optimization?.answer_modification?.length > 0 ||
                        ag.optimization?.prompt_optimization?.length > 0 ||
                        ag.optimization?.rag_optimization?.length > 0 ||
                        ag.optimization?.agent_development?.length > 0) && (
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
