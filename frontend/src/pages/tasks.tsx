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
} from "antd";
import { PlusOutlined, PlayCircleOutlined, EyeOutlined } from "@ant-design/icons";
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
    loadTasks();
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
    </MainLayout>
  );
}
