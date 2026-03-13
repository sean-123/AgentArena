"use client";

import { useEffect, useState } from "react";
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
  Switch,
  Collapse,
} from "antd";
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet, apiPost, apiDelete, apiPatch } from "@/api/client";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface AgentVersion {
  id: string;
  agent_id: string;
  version: string;
  config_json: string | null;
}

interface AgentConfig {
  type?: string;
  base_url?: string;
  baseUrl?: string;
  endpoint?: string;
  question_key?: string;
  extra_payload?: Record<string, unknown>;
  stream?: boolean;
  auth_token?: string;
  auth_token_env?: string;
  persona?: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [configForm] = Form.useForm();
  const [configuringAgent, setConfiguringAgent] = useState<Agent | null>(null);

  const loadAgents = async () => {
    try {
      const data = await apiGet<Agent[]>("/api/agents");
      setAgents(data);
    } catch (e) {
      message.error("加载 Agent 失败: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const buildConfigFromForm = (vals: Record<string, unknown>): AgentConfig => {
    const config: AgentConfig = {};
    if (vals.type) config.type = vals.type as string;
    if (vals.base_url) config.base_url = vals.base_url as string;
    if (vals.endpoint) config.endpoint = vals.endpoint as string;
    if (vals.question_key) config.question_key = vals.question_key as string;
    if (vals.stream !== undefined) config.stream = vals.stream as boolean;
    if (vals.auth_token) config.auth_token = vals.auth_token as string;
    if (vals.auth_token_env) config.auth_token_env = vals.auth_token_env as string;
    if (vals.persona) config.persona = vals.persona as string;
    if (vals.extra_payload) {
      try {
        const parsed = JSON.parse(vals.extra_payload as string);
        if (typeof parsed === "object" && parsed !== null) {
          config.extra_payload = parsed;
        }
      } catch {
        // 忽略无效 JSON
      }
    }
    return config;
  };

  const handleCreate = async () => {
    try {
      const vals = await form.validateFields();
      const config = buildConfigFromForm(vals);
      // 仅当有 base_url 时才传 config
      const hasConfig = config.base_url || Object.keys(config).length > 0;
      await apiPost("/api/agents", {
        name: vals.name,
        description: vals.description || undefined,
        config_json: hasConfig ? config : undefined,
      });
      message.success("Agent 创建成功");
      setModalOpen(false);
      form.resetFields();
      loadAgents();
    } catch (e) {
      message.error("创建失败: " + (e as Error).message);
    }
  };

  const openConfig = async (agent: Agent) => {
    setConfiguringAgent(agent);
    setConfigModalOpen(true);
    try {
      const versions = await apiGet<AgentVersion[]>(`/api/agents/${agent.id}/versions`);
      const latest = versions[0];
      let config: AgentConfig = {};
      if (latest?.config_json) {
        try {
          config = JSON.parse(latest.config_json) as AgentConfig;
        } catch {
          // ignore
        }
      }
      configForm.setFieldsValue({
        type: config.type || "http",
        base_url: config.base_url || config.baseUrl || "",
        endpoint: config.endpoint || "/chat",
        question_key: config.question_key || "question",
        extra_payload: config.extra_payload
          ? JSON.stringify(config.extra_payload, null, 2)
          : "",
        stream: config.stream ?? false,
        auth_token: config.auth_token || "",
        auth_token_env: config.auth_token_env || "",
        persona: config.persona || "",
      });
    } catch (e) {
      message.error("加载配置失败: " + (e as Error).message);
    }
  };

  const handleSaveConfig = async () => {
    if (!configuringAgent) return;
    try {
      const vals = await configForm.validateFields();
      const config = buildConfigFromForm(vals);
      const versions = await apiGet<AgentVersion[]>(`/api/agents/${configuringAgent.id}/versions`);
      const versionId = versions[0]?.id;
      if (!versionId) {
        message.error("该 Agent 暂无版本");
        return;
      }
      await apiPatch(
        `/api/agents/${configuringAgent.id}/versions/${versionId}`,
        { config_json: config }
      );
      message.success("配置已保存");
      setConfigModalOpen(false);
      setConfiguringAgent(null);
      loadAgents();
    } catch (e) {
      message.error("保存失败: " + (e as Error).message);
    }
  };

  const handleDelete = async (agent: Agent) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定删除 Agent「${agent.name}」？`,
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      async onOk() {
        await apiDelete(`/api/agents/${agent.id}`);
        message.success("已删除");
        loadAgents();
      },
    });
  };

  return (
    <MainLayout>
      <Card
        title="Agent"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
            添加 Agent
          </Button>
        }
      >
        <Table
          loading={loading}
          dataSource={agents}
          rowKey="id"
          columns={[
            { title: "名称", dataIndex: "name", key: "name" },
            { title: "描述", dataIndex: "description", key: "description", ellipsis: true },
            {
              title: "创建时间",
              dataIndex: "created_at",
              key: "created_at",
              render: (v: string) => (v ? new Date(v).toLocaleString() : "-"),
            },
            {
              title: "操作",
              key: "actions",
              render: (_, record: Agent) => (
                <Space>
                  <Button
                    size="small"
                    icon={<SettingOutlined />}
                    onClick={() => openConfig(record)}
                  >
                    配置
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

      {/* 创建 Agent - 完整配置 */}
      <Modal
        title="添加 Agent"
        open={modalOpen}
        onOk={handleCreate}
        onCancel={() => setModalOpen(false)}
        okText="创建"
        cancelText="取消"
        width={640}
      >
        <Form form={form} layout="vertical" initialValues={{ type: "http", endpoint: "/chat", question_key: "question", stream: false }}>
          <Form.Item
            name="name"
            label="Agent 名称"
            rules={[{ required: true, message: "请输入名称" }]}
          >
            <Input placeholder="如：TWServiceGuide" />
          </Form.Item>
          <Form.Item
            name="persona"
            label="人设 (persona)"
            extra="用于 AI 评测时，将规范问题改写为该人设下的自然提问"
          >
            <Input.TextArea rows={3} placeholder="如：你是厦门市政务热线客服，用户多为市民咨询办事流程、政策等" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>

          <Collapse
            items={[
              {
                key: "http",
                label: "HTTP 配置（参考 agents.yaml）",
                children: (
                  <div>
                    <Form.Item name="base_url" label="base_url">
                      <Input placeholder="如：http://10.2.1.16:30295" />
                    </Form.Item>
                    <Form.Item name="endpoint" label="endpoint">
                      <Input placeholder="默认 /chat" />
                    </Form.Item>
                    <Form.Item name="question_key" label="question_key">
                      <Input placeholder="请求体中问题字段名，默认 question" />
                    </Form.Item>
                    <Form.Item name="stream" label="流式返回 (stream)" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item
                      name="extra_payload"
                      label="extra_payload"
                      extra='JSON 对象，如 {"region_1": "厦门市"}'
                    >
                      <Input.TextArea rows={3} placeholder='{"region_1": "厦门市", "conversation_id": "xxx"}' />
                    </Form.Item>
                    <Form.Item name="auth_token" label="auth_token">
                      <Input.Password placeholder="Bearer Token，或留空用 auth_token_env" />
                    </Form.Item>
                    <Form.Item
                      name="auth_token_env"
                      label="auth_token_env"
                      extra="从环境变量读取 Token 的变量名，如 AGENT_TW_SERVICE_TOKEN"
                    >
                      <Input placeholder="如：AGENT_TW_SERVICE_TOKEN" />
                    </Form.Item>
                  </div>
                ),
              },
            ]}
          />
        </Form>
      </Modal>

      {/* 编辑配置 */}
      <Modal
        title={configuringAgent ? `配置 - ${configuringAgent.name}` : "配置"}
        open={configModalOpen}
        onOk={handleSaveConfig}
        onCancel={() => {
          setConfigModalOpen(false);
          setConfiguringAgent(null);
        }}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form
          form={configForm}
          layout="vertical"
          initialValues={{ endpoint: "/chat", question_key: "question", stream: false }}
        >
          <Form.Item
            name="persona"
            label="人设 (persona)"
            extra="用于 AI 评测时，将规范问题改写为该人设下的自然提问"
          >
            <Input.TextArea rows={3} placeholder="如：你是厦门市政务热线客服，用户多为市民咨询办事流程、政策等" />
          </Form.Item>
          <Form.Item name="base_url" label="base_url" rules={[{ required: true, message: "请输入 base_url" }]}>
            <Input placeholder="如：http://10.2.1.16:30295" />
          </Form.Item>
          <Form.Item name="endpoint" label="endpoint">
            <Input placeholder="/chat" />
          </Form.Item>
          <Form.Item name="question_key" label="question_key">
            <Input placeholder="question" />
          </Form.Item>
          <Form.Item name="stream" label="流式返回 (stream)" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="extra_payload" label="extra_payload">
            <Input.TextArea rows={3} placeholder='{"key": "value"}' />
          </Form.Item>
          <Form.Item name="auth_token" label="auth_token">
            <Input.Password placeholder="Bearer Token" />
          </Form.Item>
          <Form.Item name="auth_token_env" label="auth_token_env">
            <Input placeholder="环境变量名" />
          </Form.Item>
        </Form>
      </Modal>
    </MainLayout>
  );
}
