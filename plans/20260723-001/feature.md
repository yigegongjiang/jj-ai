# OpenRouter 模型数据消费指南

场景：低频 sync 一份全量数据到 Cloudflare store，日常直接读 store，不再高频调 OpenRouter API。

## Sync（低频，手动执行）

```bash
curl -s "https://openrouter.ai/api/v1/models?output_modalities=all" -o models.json
```

- 必须带 `output_modalities=all`，否则默认只拿 `text` 输出模型，漏掉 image/embeddings/video 等（已实测：默认 342 条，加了是 441 条）
- 不传 `offset`/`limit` 即为全量，无需分页
- 无需 API Key

## Store 中每条模型数据的可用字段

<!-- prettier-ignore -->
| 字段 | 说明 |
| --- | --- |
| `id` | 唯一标识，调用 API 用 |
| `name` | 展示名称 |
| `description` | 能力描述 |
| `created` | 上架时间（Unix 时间戳） |
| `context_length` | 最大上下文窗口（tokens） |
| `expiration_date` | 停用日期，未停用为 `null` |
| `architecture` | 见下 |
| `pricing` | 见下 |
| `top_provider` | 见下 |
| `supported_parameters` | 见下 |
| `benchmarks.design_arena` | 见下，多数模型无此字段 |

**architecture**：`input_modalities`/`output_modalities`（如 text/image/audio）、`tokenizer`、`instruct_type`

**pricing**（USD，`"0"` 为免费）：`prompt`/`completion`/`request`/`image`/`web_search`/`internal_reasoning`/`input_cache_read`/`input_cache_write`；可选 `overrides` 数组，条件为超长上下文（`min_prompt_tokens`）或分时段（`utc_start`/`utc_end`），顶层价格只是当前生效值，消费时若要展示完整价格表需读 `overrides`

**top_provider**：`context_length`、`max_completion_tokens`、`is_moderated`

**supported_parameters**（数组）：`tools`、`tool_choice`、`max_tokens`、`temperature`、`top_p`、`reasoning`、`structured_outputs`、`response_format`、`stop`、`frequency_penalty`、`presence_penalty`、`seed` 等

**benchmarks.design_arena**（数组）：`arena`、`category`、`elo`、`win_rate`、`rank`

## 存量数据里没有的维度（需注意）

> 已明确不需要这些维度。

`throughput`（吞吐量）、`latency`（首字延迟）、`most-popular`（周活跃度）这三个维度**不是模型对象字段**，只是 OpenRouter 实时 API `sort` 参数的排序依据，静态快照里拿不到具体数值。若 Web 页面要做这三项排序/展示，需单独实时调用 API（如 `?sort=throughput-high-to-low`），无法从 Cloudflare store 里算出来。
