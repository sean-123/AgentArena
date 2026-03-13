"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Card, Row, Col, Statistic, Button } from "antd";
import {
  TrophyOutlined,
  DatabaseOutlined,
  RobotOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet } from "@/api/client";

export default function Home() {
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      apiGet<unknown[]>("/api/tasks").then((d) => setTasks(Array.isArray(d) ? d : [])).catch(() => {}),
      apiGet<unknown[]>("/api/agents").then((d) => setAgents(Array.isArray(d) ? d : [])).catch(() => {}),
      apiGet<unknown[]>("/api/reports/leaderboard").then((d) => setLeaderboard(Array.isArray(d) ? d : [])).catch(() => {}),
    ]).catch(() => {});
  }, []);

  return (
    <MainLayout>
      <Card title="控制台" style={{ marginBottom: 24 }}>
        <Row gutter={24}>
          <Col span={8}>
            <Statistic
              title="任务数"
              value={tasks.length}
              prefix={<UnorderedListOutlined />}
            />
            <Button
              type="link"
              onClick={() => router.push("/tasks")}
              style={{ paddingLeft: 8 }}
            >
              管理任务
            </Button>
          </Col>
          <Col span={8}>
            <Statistic
              title="Agent 数"
              value={agents.length}
              prefix={<RobotOutlined />}
            />
            <Button
              type="link"
              onClick={() => router.push("/agents")}
              style={{ paddingLeft: 8 }}
            >
              管理 Agent
            </Button>
          </Col>
          <Col span={8}>
            <Statistic
              title="排行榜条目"
              value={leaderboard.length}
              prefix={<TrophyOutlined />}
            />
            <Button
              type="link"
              onClick={() => router.push("/leaderboard")}
              style={{ paddingLeft: 8 }}
            >
              查看排行榜
            </Button>
          </Col>
        </Row>
      </Card>
      <Card title="快速开始">
        <p>1. 初始化数据库：<Button type="link" onClick={() => router.push("/settings")}>设置 → 数据库初始化</Button></p>
        <p>2. 创建数据集并导入测试用例：<Button type="link" onClick={() => router.push("/datasets")}>数据集</Button>（支持 JSON 或 Excel）</p>
        <p>3. 添加 Agent 并配置 HTTP 接口：<Button type="link" onClick={() => router.push("/agents")}>Agent</Button></p>
        <p>4. 创建评估任务并运行：<Button type="link" onClick={() => router.push("/tasks")}>评估任务</Button></p>
        <p>5. 查看排行榜：<Button type="link" onClick={() => router.push("/leaderboard")}>排行榜</Button></p>
      </Card>
    </MainLayout>
  );
}
