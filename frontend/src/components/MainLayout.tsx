import { useRouter } from "next/router";
import { Layout, Menu } from "antd";
import {
  HomeOutlined,
  UnorderedListOutlined,
  DatabaseOutlined,
  RobotOutlined,
  TrophyOutlined,
  SettingOutlined,
} from "@ant-design/icons";

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: "/", icon: <HomeOutlined />, label: "控制台" },
  { key: "/tasks", icon: <UnorderedListOutlined />, label: "评估任务" },
  { key: "/datasets", icon: <DatabaseOutlined />, label: "数据集" },
  { key: "/agents", icon: <RobotOutlined />, label: "Agent" },
  { key: "/leaderboard", icon: <TrophyOutlined />, label: "排行榜" },
  { key: "/settings", icon: <SettingOutlined />, label: "设置" },
];

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = router.pathname || "/";

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider theme="dark" width={200}>
        <div
          style={{
            height: 48,
            color: "white",
            fontSize: 18,
            display: "flex",
            alignItems: "center",
            paddingLeft: 24,
          }}
        >
          AgentArena
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={menuItems}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout style={{ overflowX: "hidden" }}>
        <Content style={{ padding: 24, overflowX: "hidden" }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
