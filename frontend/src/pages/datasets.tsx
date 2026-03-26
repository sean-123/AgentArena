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
  Upload,
  Drawer,
  Popconfirm,
  Select,
} from "antd";
import {
  PlusOutlined,
  UploadOutlined,
  FileExcelOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import MainLayout from "@/components/MainLayout";
import { apiGet, apiPost, apiPostFile, apiPatch, apiDelete } from "@/api/client";

interface Dataset {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

interface DatasetVersion {
  id: string;
  dataset_id: string;
  version: string;
}

interface Testcase {
  id: string;
  dataset_version_id: string;
  question: string;
  persona_question: string | null;
  key_points: string | null;
  domain: string | null;
  difficulty: string | null;
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  // 数据项相关
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentDataset, setCurrentDataset] = useState<Dataset | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);
  const [testcases, setTestcases] = useState<Testcase[]>([]);
  const [testcasesLoading, setTestcasesLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [testcaseModalOpen, setTestcaseModalOpen] = useState(false);
  const [testcaseForm] = Form.useForm();
  const [editingTestcase, setEditingTestcase] = useState<Testcase | null>(null);

  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await apiGet<Dataset[]>("/api/datasets");
      setDatasets(data);
    } catch (e) {
      message.error("加载数据集失败: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleCreate = async () => {
    try {
      const vals = await createForm.validateFields();
      const body: { name: string; description?: string } = { name: vals.name.trim() };
      if (vals.description && String(vals.description).trim()) {
        body.description = String(vals.description).trim();
      }
      await apiPost("/api/datasets", body);
      message.success("数据集创建成功");
      setCreateModalOpen(false);
      createForm.resetFields();
      loadDatasets();
    } catch (e) {
      if ((e as Error).message?.includes("required") || (e as Error).message?.includes("请")) {
        return; // 表单校验错误，不弹出 message
      }
      message.error("创建失败: " + (e as Error).message);
    }
  };

  const handleDeleteDataset = async (ds: Dataset) => {
    try {
      await apiDelete(`/api/datasets/${ds.id}`);
      message.success("数据集已删除");
      if (currentDataset?.id === ds.id) setDrawerOpen(false);
      loadDatasets();
    } catch (e) {
      message.error("删除失败: " + (e as Error).message);
    }
  };

  const handleImportJson = async (file: File) => {
    try {
      const res = await apiPostFile<{ dataset_id: string; imported: number }>(
        "/api/datasets/import-json",
        file
      );
      message.success(`已导入 ${res.imported} 条测试用例`);
      loadDatasets();
    } catch (e) {
      message.error("导入失败: " + (e as Error).message);
      throw e;
    }
  };

  const openDrawer = async (ds: Dataset) => {
    setCurrentDataset(ds);
    setDrawerOpen(true);
    try {
      const vers = await apiGet<DatasetVersion[]>(`/api/datasets/${ds.id}/versions`);
      setVersions(vers);
      const verId = vers[0]?.id || "";
      setSelectedVersionId(verId);
      if (verId) {
        await loadTestcases(ds.id, verId);
      } else {
        setTestcases([]);
      }
    } catch (e) {
      message.error("加载版本失败: " + (e as Error).message);
      setTestcases([]);
    }
  };

  const loadTestcases = async (datasetId: string, versionId: string) => {
    setTestcasesLoading(true);
    try {
      const data = await apiGet<Testcase[]>(
        `/api/datasets/${datasetId}/versions/${versionId}/testcases`
      );
      setTestcases(data);
    } catch (e) {
      message.error("加载测试用例失败: " + (e as Error).message);
      setTestcases([]);
    } finally {
      setTestcasesLoading(false);
    }
  };

  useEffect(() => {
    if (drawerOpen && currentDataset && selectedVersionId) {
      loadTestcases(currentDataset.id, selectedVersionId);
    }
  }, [selectedVersionId, drawerOpen, currentDataset?.id]);

  const openAddTestcase = () => {
    setEditingTestcase(null);
    testcaseForm.resetFields();
    setTestcaseModalOpen(true);
  };

  const openEditTestcase = (tc: Testcase) => {
    setEditingTestcase(tc);
    let keyPoints: string[] = [];
    if (tc.key_points) {
      try {
        keyPoints = JSON.parse(tc.key_points) as string[];
      } catch {
        keyPoints = tc.key_points ? [tc.key_points] : [];
      }
    }
    testcaseForm.setFieldsValue({
      question: tc.question,
      persona_question: tc.persona_question || "",
      key_points: keyPoints,
      domain: tc.domain || "",
      difficulty: tc.difficulty || "",
    });
    setTestcaseModalOpen(true);
  };

  const handleSaveTestcase = async () => {
    if (!currentDataset || !selectedVersionId) return;
    try {
      const vals = await testcaseForm.validateFields();
      const keyPoints = Array.isArray(vals.key_points) ? vals.key_points : [];
      if (editingTestcase) {
        await apiPatch(
          `/api/datasets/${currentDataset.id}/versions/${selectedVersionId}/testcases/${editingTestcase.id}`,
          {
            question: vals.question?.trim() || "",
            persona_question: vals.persona_question?.trim() || null,
            key_points: keyPoints.length ? keyPoints : null,
            domain: vals.domain?.trim() || null,
            difficulty: vals.difficulty?.trim() || null,
          }
        );
        message.success("已更新");
      } else {
        await apiPost(
          `/api/datasets/${currentDataset.id}/versions/${selectedVersionId}/testcases`,
          {
            question: vals.question?.trim() || "",
            persona_question: vals.persona_question?.trim() || undefined,
            key_points: keyPoints.length ? keyPoints : undefined,
            domain: vals.domain?.trim() || undefined,
            difficulty: vals.difficulty?.trim() || undefined,
          }
        );
        message.success("已添加");
      }
      setTestcaseModalOpen(false);
      loadTestcases(currentDataset.id, selectedVersionId);
    } catch (e) {
      message.error("保存失败: " + (e as Error).message);
    }
  };

  const handleDeleteTestcase = async (tc: Testcase) => {
    if (!currentDataset || !selectedVersionId) return;
    try {
      await apiDelete(
        `/api/datasets/${currentDataset.id}/versions/${selectedVersionId}/testcases/${tc.id}`
      );
      message.success("已删除");
      loadTestcases(currentDataset.id, selectedVersionId);
    } catch (e) {
      message.error("删除失败: " + (e as Error).message);
    }
  };

  const parseKeyPoints = (s: string | null): string[] => {
    if (!s) return [];
    try {
      const arr = JSON.parse(s) as string[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  return (
    <MainLayout>
      <Card
        title="数据集"
        extra={
          <Space>
            <Button
              icon={<DownloadOutlined />}
              href="/testcase-import-template.xlsx"
              download="testcase-import-template.xlsx"
            >
              下载 Excel 模板
            </Button>
            <Upload
              accept=".json"
              showUploadList={false}
              beforeUpload={(file) => {
                handleImportJson(file);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>导入 JSON</Button>
            </Upload>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalOpen(true)}>
              创建数据集
            </Button>
          </Space>
        }
      >
        <Table
          loading={loading}
          dataSource={datasets}
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
              width: 280,
              render: (_: unknown, record: Dataset) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => openDrawer(record)}
                  >
                    查看数据
                  </Button>
                  <Upload
                    accept=".xlsx,.xls"
                    showUploadList={false}
                    beforeUpload={async (file) => {
                      try {
                        const vers = await apiGet<DatasetVersion[]>(
                          `/api/datasets/${record.id}/versions`
                        );
                        const versionId = vers[0]?.id;
                        if (!versionId) {
                          message.error("该数据集暂无版本");
                          return false;
                        }
                        const res = await apiPostFile<{ imported: number }>(
                          `/api/datasets/${record.id}/versions/${versionId}/import-excel`,
                          file
                        );
                        message.success(`已导入 ${res.imported} 条测试用例`);
                        loadDatasets();
                        if (currentDataset?.id === record.id) {
                          loadTestcases(record.id, versionId);
                        }
                      } catch (e) {
                        message.error("导入失败: " + (e as Error).message);
                      }
                      return false;
                    }}
                  >
                    <Button size="small" icon={<FileExcelOutlined />} type="link">
                      导入 Excel
                    </Button>
                  </Upload>
                  <Popconfirm
                    title="确定删除该数据集？"
                    description="将同时删除所有版本和测试用例"
                    onConfirm={() => handleDeleteDataset(record)}
                  >
                    <Button size="small" danger icon={<DeleteOutlined />} type="link">
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 创建数据集 */}
      <Modal
        title="创建数据集"
        open={createModalOpen}
        onOk={handleCreate}
        onCancel={() => setCreateModalOpen(false)}
        okText="创建"
        cancelText="取消"
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="name"
            label="数据集名称"
            rules={[{ required: true, message: "请输入名称" }, { whitespace: true, message: "名称不能为空" }]}
          >
            <Input placeholder="如：客服知识库测试" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={2} placeholder="可选" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 数据项抽屉 */}
      <Drawer
        title={currentDataset ? `数据项 - ${currentDataset.name}` : "数据项"}
        placement="right"
        width={1440}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{
          body: {
            paddingBottom: 32,
            paddingRight: 24,
            overflowX: "hidden",
            overflowY: "auto",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          },
        }}
        className="datasets-drawer"
      >
        {currentDataset && (
          <div style={{ paddingBottom: 24 }}>
            {versions.length > 1 && (
              <Space style={{ marginBottom: 16 }}>
                <span>版本：</span>
                <Select
                  value={selectedVersionId}
                  onChange={setSelectedVersionId}
                  options={versions.map((v) => ({ label: v.version, value: v.id }))}
                  style={{ width: 120 }}
                />
              </Space>
            )}
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={openAddTestcase}
              disabled={!selectedVersionId}
              style={{ marginBottom: 20 }}
            >
              新增数据项
            </Button>
            <Table
              loading={testcasesLoading}
              dataSource={testcases}
              rowKey="id"
              size="small"
              scroll={{ x: "max-content" }}
              style={{ marginBottom: 24 }}
              columns={[
                { title: "ID", dataIndex: "id", key: "id", width: 120, ellipsis: true },
                { title: "问题", dataIndex: "question", key: "question", ellipsis: true },
                {
                  title: "关键点",
                  dataIndex: "key_points",
                  key: "key_points",
                  ellipsis: true,
                  render: (v: string | null) => parseKeyPoints(v).join("; ") || "-",
                },
                { title: "领域", dataIndex: "domain", key: "domain", width: 80 },
                { title: "难度", dataIndex: "difficulty", key: "difficulty", width: 70 },
                {
                  title: "操作",
                  key: "actions",
                  width: 100,
                  render: (_: unknown, tc: Testcase) => (
                    <Space>
                      <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEditTestcase(tc)}>
                        编辑
                      </Button>
                      <Popconfirm
                        title="确定删除该数据项？"
                        onConfirm={() => handleDeleteTestcase(tc)}
                      >
                        <Button size="small" danger type="link" icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>
                    </Space>
                  ),
                },
              ]}
            />
          </div>
        )}
      </Drawer>

      {/* 新增/编辑数据项 */}
      <Modal
        title={editingTestcase ? "编辑数据项" : "新增数据项"}
        open={testcaseModalOpen}
        onOk={handleSaveTestcase}
        onCancel={() => setTestcaseModalOpen(false)}
        okText="保存"
        cancelText="取消"
        width={560}
      >
        <Form form={testcaseForm} layout="vertical">
          <Form.Item
            name="question"
            label="问题 (question)"
            rules={[{ required: true, message: "请输入问题" }]}
          >
            <Input.TextArea rows={3} placeholder="规范问题" />
          </Form.Item>
          <Form.Item name="persona_question" label="人设问题 (persona_question)">
            <Input.TextArea rows={2} placeholder="可选，预生成的人设提问" />
          </Form.Item>
          <Form.Item
            name="key_points"
            label="关键点 (key_points)"
            extra="多个要点用逗号分隔，或留空"
          >
            <Select
              mode="tags"
              placeholder="输入后回车添加"
              tokenSeparators={[","]}
              options={[]}
            />
          </Form.Item>
          <Form.Item name="domain" label="领域 (domain)">
            <Input placeholder="可选，如 tw_enterprise" />
          </Form.Item>
          <Form.Item name="difficulty" label="难度 (difficulty)">
            <Select placeholder="可选" allowClear>
              <Select.Option value="easy">easy</Select.Option>
              <Select.Option value="medium">medium</Select.Option>
              <Select.Option value="hard">hard</Select.Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </MainLayout>
  );
}
