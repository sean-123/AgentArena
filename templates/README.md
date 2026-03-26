# Excel 导入模板说明

## 测试用例导入模板

文件：`testcase-import-template.xlsx`

### 列说明

| 列名 | 必填 | 说明 |
|------|------|------|
| id | 否 | 测试用例 ID，不填则自动生成 |
| question | **是** | 评测问题（也支持 `q`、`问题`） |
| persona_question | 否 | 角色化问题（也支持 `persona`） |
| key_points | 否 | 评分要点，逗号分隔或 JSON 数组，如 `["要点1","要点2"]` |
| domain | 否 | 领域分类 |
| difficulty | 否 | 难度（如：简单、中等、困难） |

### 使用方式

1. 在「数据集」页面选择目标数据集
2. 点击「导入 Excel」按钮
3. 选择填写好的 Excel 文件（.xlsx 或 .xls）

### 重新生成模板

```bash
cd backend
uv run python ../scripts/generate_excel_template.py
```

脚本会同时更新 `templates/` 和 `frontend/public/`，数据集管理页面的「下载 Excel 模板」按钮将提供最新模板。
