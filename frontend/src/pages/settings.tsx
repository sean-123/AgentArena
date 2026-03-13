"use client";

import { useState } from "react";
import { Card, Button, Form, Input, InputNumber, message, Divider } from "antd";
import MainLayout from "@/components/MainLayout";
import { apiGet, apiPost } from "@/api/client";

export default function SettingsPage() {
  const [initLoading, setInitLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [form] = Form.useForm();

  const handleDbInit = async () => {
    try {
      setInitLoading(true);
      await apiPost("/api/system/database/init", {});
      message.success("数据库初始化成功");
    } catch (e) {
      message.error("初始化失败: " + (e as Error).message);
    } finally {
      setInitLoading(false);
    }
  };

  const handleConfigSave = async () => {
    try {
      const vals = await form.validateFields();
      setConfigLoading(true);
      await apiPost("/api/system/database/config", {
        host: vals.host,
        port: vals.port,
        database: vals.database,
        username: vals.username,
        password: vals.password,
      });
      message.success("配置已保存（需重启服务生效）");
    } catch (e) {
      message.error("保存失败: " + (e as Error).message);
    } finally {
      setConfigLoading(false);
    }
  };

  return (
    <MainLayout>
      <Card title="数据库配置">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            host: "localhost",
            port: 3306,
            database: "agent_arena",
            username: "root",
            password: "",
          }}
        >
          <Form.Item name="host" label="主机" rules={[{ required: true }]}>
            <Input placeholder="localhost" />
          </Form.Item>
          <Form.Item name="port" label="端口" rules={[{ required: true }]}>
            <InputNumber min={1} max={65535} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="database" label="数据库名" rules={[{ required: true }]}>
            <Input placeholder="agent_arena" />
          </Form.Item>
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="root" />
          </Form.Item>
          <Form.Item name="password" label="密码">
            <Input.Password placeholder="可选" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              loading={configLoading}
              onClick={handleConfigSave}
            >
              保存配置
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="数据库初始化" style={{ marginTop: 24 }}>
        <p style={{ marginBottom: 16, color: "#666" }}>
          首次使用或重置时，点击下方按钮创建数据库表结构。
        </p>
        <Button
          type="primary"
          danger
          loading={initLoading}
          onClick={handleDbInit}
        >
          一键初始化数据库
        </Button>
      </Card>
    </MainLayout>
  );
}
