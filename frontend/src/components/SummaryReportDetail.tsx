"use client";

import { Button, Card, Space, Typography, message } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import type { AgentSummary, ComparisonModelSummary, PromptOptimizationItem, SummaryReport } from "@/types/summaryReport";
import {
  downloadAgentSummaryMarkdown,
  downloadComparisonSummaryMarkdown,
  downloadFullSummaryMarkdown,
  downloadPromptOptimizationMarkdown,
} from "@/utils/summaryReportMarkdown";

export default function SummaryReportDetail({ data }: { data: SummaryReport }) {
  const onDownloadFull = () => {
    downloadFullSummaryMarkdown(data);
    message.success("已开始下载完整批次总结（Markdown）");
  };

  const dlAgent = (ag: AgentSummary) => {
    downloadAgentSummaryMarkdown(data, ag);
    message.success(`已下载：${ag.agent_name}`);
  };

  const dlComp = (cm: ComparisonModelSummary) => {
    downloadComparisonSummaryMarkdown(data, cm);
    message.success(`已下载：${cm.model_display_name}`);
  };

  const dlPrompt = (item: PromptOptimizationItem) => {
    downloadPromptOptimizationMarkdown(data, item);
    message.success(`已下载 Prompt：${item.prompt_id}`);
  };

  return (
    <div style={{ maxHeight: "70vh", overflow: "auto" }}>
      <Space wrap style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<DownloadOutlined />} onClick={onDownloadFull}>
          下载完整批次总结（Markdown）
        </Button>
      </Space>

      <Typography.Paragraph type="secondary">
        共 {data.total_evaluations} 条评测，按 Agent 聚合优缺点与优化建议
      </Typography.Paragraph>

      {(data.reply_quality_summary || data.info_accuracy_summary || (data.reply_experience_suggestions?.length ?? 0) > 0) && (
        <div style={{ marginTop: 16, padding: 16, background: "#f9fafb", borderRadius: 8 }}>
          <Typography.Title level={5} style={{ marginTop: 0, color: "#1677ff" }}>
            质量总评
          </Typography.Title>
          {data.reply_quality_summary && (
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>回复质量：</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.reply_quality_summary}</Typography.Paragraph>
            </div>
          )}
          {data.info_accuracy_summary && (
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong>信息准确度：</Typography.Text>
              <Typography.Paragraph style={{ marginBottom: 0 }}>{data.info_accuracy_summary}</Typography.Paragraph>
            </div>
          )}
          {data.reply_experience_suggestions?.length ? (
            <div>
              <Typography.Text strong>回复体验改进建议：</Typography.Text>
              <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                {data.reply_experience_suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {(data.overall_top_pros?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#52c41a" }}>
            全局高频优点
          </Typography.Title>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            {(data.overall_top_pros ?? []).map((p, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <span>{p.text}</span>
                <span style={{ color: "#999", marginLeft: 8 }}>×{p.count}</span>
                {p.examples?.length ? (
                  <div style={{ marginTop: 6, marginLeft: 0, fontSize: 13, color: "#595959" }}>
                    {p.examples.map((ex, j) => (
                      <div key={j} style={{ marginBottom: 4, padding: 8, background: "#fafafa", borderRadius: 4 }}>
                        <div>
                          <strong>例：</strong>问：「{ex.question?.slice(0, 80)}
                          {ex.question && ex.question.length > 80 ? "…" : ""}」
                        </div>
                        <div style={{ marginTop: 4 }}>
                          答：「{ex.answer_snippet?.slice(0, 120)}
                          {ex.answer_snippet && ex.answer_snippet.length > 120 ? "…" : ""}」
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {(data.overall_top_cons?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#ff4d4f" }}>
            全局高频缺点
          </Typography.Title>
          <ul style={{ paddingLeft: 20, marginBottom: 0 }}>
            {(data.overall_top_cons ?? []).map((c, i) => (
              <li key={i} style={{ marginBottom: 12 }}>
                <span>{c.text}</span>
                <span style={{ color: "#999", marginLeft: 8 }}>×{c.count}</span>
                {c.examples?.length ? (
                  <div style={{ marginTop: 6, marginLeft: 0, fontSize: 13, color: "#595959" }}>
                    {c.examples.map((ex, j) => (
                      <div key={j} style={{ marginBottom: 4, padding: 8, background: "#fff2f0", borderRadius: 4 }}>
                        <div>
                          <strong>例：</strong>问：「{ex.question?.slice(0, 80)}
                          {ex.question && ex.question.length > 80 ? "…" : ""}」
                        </div>
                        <div style={{ marginTop: 4 }}>
                          答：「{ex.answer_snippet?.slice(0, 120)}
                          {ex.answer_snippet && ex.answer_snippet.length > 120 ? "…" : ""}」
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.overall_optimization &&
        ((data.overall_optimization.answer_modification?.length ?? 0) > 0 ||
          (data.overall_optimization.prompt_optimization?.length ?? 0) > 0 ||
          (data.overall_optimization.rag_optimization?.length ?? 0) > 0 ||
          (data.overall_optimization.agent_development?.length ?? 0) > 0) && (
          <>
            <Typography.Title level={5} style={{ marginTop: 16, color: "#1890ff" }}>
              优化建议汇总
            </Typography.Title>
            {(data.overall_optimization.answer_modification?.length ?? 0) > 0 && (
              <>
                <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                  回答修改建议
                </Typography.Text>
                <ul style={{ paddingLeft: 20 }}>
                  {data.overall_optimization.answer_modification.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {(data.overall_optimization.prompt_optimization?.length ?? 0) > 0 && (
              <>
                <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                  提示词优化
                </Typography.Text>
                <ul style={{ paddingLeft: 20 }}>
                  {data.overall_optimization.prompt_optimization.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {(data.overall_optimization.rag_optimization?.length ?? 0) > 0 && (
              <>
                <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                  RAG 相关优化
                </Typography.Text>
                <ul style={{ paddingLeft: 20 }}>
                  {data.overall_optimization.rag_optimization.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {(data.overall_optimization.agent_development?.length ?? 0) > 0 && (
              <>
                <Typography.Text strong style={{ display: "block", marginTop: 8 }}>
                  Agent 架构/模型优化
                </Typography.Text>
                <ul style={{ paddingLeft: 20 }}>
                  {(data.overall_optimization.agent_development ?? []).map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

      {(data.agent_development_suggestions?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#722ed1" }}>
            Agent 开发优化建议
          </Typography.Title>
          <Typography.Paragraph type="secondary">基于整批次评测提炼的开发方向与优化建议</Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {(data.agent_development_suggestions ?? []).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {(data.by_agent?.length ?? 0) > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24 }}>
            各 Agent 详情
          </Typography.Title>
          {(data.by_agent ?? []).map((ag) => (
            <Card
              key={ag.agent_version_id}
              size="small"
              style={{ marginBottom: 12 }}
              title={
                <span>
                  <Typography.Text strong>{ag.agent_name}</Typography.Text>
                  <span style={{ color: "#999", marginLeft: 8 }}>{ag.evaluation_count} 条评测</span>
                </span>
              }
              extra={
                <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => dlAgent(ag)}>
                  Markdown
                </Button>
              }
            >
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

      {data.comparison_by_model && data.comparison_by_model.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, color: "#fa8c16" }}>
            对比通用大模型
          </Typography.Title>
          {data.comparison_by_model.map((cm) => (
            <Card
              key={cm.model_type}
              size="small"
              style={{ marginBottom: 12 }}
              title={
                <span>
                  <Typography.Text strong>{cm.model_display_name}</Typography.Text>
                  <span style={{ color: "#999", marginLeft: 8 }}>
                    {cm.evaluation_count} 条评测
                    {cm.avg_score != null ? ` · 平均分 ${cm.avg_score}` : ""}
                  </span>
                </span>
              }
              extra={
                <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => dlComp(cm)}>
                  Markdown
                </Button>
              }
            >
              <div style={{ marginTop: 8 }}>
                {(cm.top_pros?.length ?? 0) > 0 && (
                  <div>
                    <Typography.Text type="success">优点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {cm.top_pros.map((p, i) => (
                        <li key={i}>
                          {p.text} ×{p.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(cm.top_cons?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Typography.Text type="danger">缺点：</Typography.Text>
                    <ul style={{ paddingLeft: 20, margin: "4px 0 0" }}>
                      {cm.top_cons.map((c, i) => (
                        <li key={i}>
                          {c.text} ×{c.count}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </>
      )}

      {data.agent_vs_comparison && data.agent_vs_comparison.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#13c2c2" }}>
            Agent 对比通用大模型
          </Typography.Title>
          <ul style={{ paddingLeft: 20 }}>
            {data.agent_vs_comparison.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {data.takeaways_from_comparison && data.takeaways_from_comparison.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#2f54eb" }}>
            借鉴通用大模型的可取之处
          </Typography.Title>
          <Typography.Paragraph type="secondary">通用大模型回答中可供 Agent 借鉴的优点与改进方向</Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {data.takeaways_from_comparison.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {data.comparison_reverse_validation && data.comparison_reverse_validation.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16, color: "#eb2f96" }}>
            通用大模型反向验证
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            使用通用大模型的返回结果反向验证 Agent 的回复，识别要点缺失并给出优化建议
          </Typography.Paragraph>
          <ul style={{ paddingLeft: 20 }}>
            {data.comparison_reverse_validation.map((s, i) => (
              <li
                key={i}
                style={s.startsWith("【") ? { listStyle: "none", fontWeight: 600, marginTop: i > 0 ? 12 : 0 } : {}}
              >
                {s}
              </li>
            ))}
          </ul>
        </>
      )}

      {data.prompt_optimization_by_agent && data.prompt_optimization_by_agent.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 24, color: "#1890ff" }}>
            Langfuse Prompt 优化建议
          </Typography.Title>
          <Typography.Paragraph type="secondary">
            从 Langfuse 读取的 Agent 关联 Prompt 文件，结合评测反馈给出的针对性优化建议
          </Typography.Paragraph>
          {data.prompt_optimization_by_agent.map((item, idx) => (
            <Card
              key={idx}
              size="small"
              style={{ marginTop: 12 }}
              title={
                <span>
                  <Typography.Text strong>{item.agent_name}</Typography.Text>
                  <span style={{ color: "#999", marginLeft: 8 }}>Prompt: {item.prompt_id}</span>
                  {item.prompt_version && <span style={{ color: "#999", marginLeft: 4 }}>v{item.prompt_version}</span>}
                </span>
              }
              extra={
                <Button type="link" size="small" icon={<DownloadOutlined />} onClick={() => dlPrompt(item)}>
                  Markdown
                </Button>
              }
            >
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

      {data.total_evaluations === 0 && (
        <div style={{ color: "#999", padding: 24, textAlign: "center" }}>暂无评测数据，无法生成总结报告</div>
      )}
    </div>
  );
}
