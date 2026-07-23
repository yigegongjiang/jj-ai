# 模型筛选维度定义

用于 web 页面开发: 查询可部署开源模型 + 配置。数据源: [Wecko-ai/modelfit](https://github.com/Wecko-ai/modelfit) API `https://modelfit.io/api/dataset/` (107 模型, 2026-07-06)。

## 筛选维度 (Filter, 对应字段可行)

<!-- prettier-ignore -->
| 维度 | 字段 | 取值 | 说明 |
|---|---|---|---|
| 硬件门槛 | `minRamGb` | 数值(1-400GB) | 核心维度: 按用户内存/显存反查能跑什么 |
| 本地可部署 | `runsLocally` | bool | 一级开关: 本地跑 / 仅云端API |
| 权重开放性 | `openWeights` | bool | 开源可下载 / 闭源(即使 openWeights=true 也可能 runsLocally=false, 需集群) |
| 模型系列 | `family` | 21 个枚举(Qwen/Llama/Gemma/...) | 下拉筛选 |
| 参数规模 | `params` | 数值(0.36B-1600B) | 范围筛选, 与 minRamGb 强相关但非线性(MoE 模型参数大但占用小) |
| 量化配置 | `quantization` | Q4_K_M/Q5_K_M/Q6_K/Q8_0/MXFP4/API | 即"部署配置"本身, 同一模型多量化=多条记录 |
| 用途场景 | `bestFor` | 35+ 标签, 逗号分隔 | 需归并为主类目(Coding/Agentic/Reasoning/Long Context/Tool calling/Edge/Translation/Math/Vision), 原始标签太碎不能直接当维度 |

## 详情维度 (Detail, 筛选后展示, 非筛选项)

<!-- prettier-ignore -->
| 维度 | 字段 | 说明 |
|---|---|---|
| 预估占用 | `estimatedLoadGb` | 精确内存/显存规划, 比 minRamGb 更细 |
| 部署命令 | `ollamaCommand` | 结果卡片直接展示可复制命令 |
| KV 缓存 | `kvKbPerToken` | 数据集内基本为 null, 暂无实用价值 |

## 不建议作为维度的字段

<!-- prettier-ignore -->
| 字段 | 原因 |
|---|---|
| `runtimes` | 本地模型 100% 为 `[ollama, llama.cpp, lm-studio]`, 零区分度 |
| `ggufDiy` | 仅 3/107 命中(true), 样本太少, 无筛选意义, 可做角标提示 |

## 页面结构建议

1. 筛选区: 硬件门槛(滑块/输入 RAM) + 系列(多选) + 用途类目(多选) + 本地/云端开关
2. 结果列表: 模型名 / 参数 / 量化 / 最低RAM / 用途标签
3. 详情/展开: 部署命令 + 预估占用 + ggufDiy 提示 + openWeights 状态

## 待确认(需人工数据侧核实, 非维度设计问题)

- `bestFor` 标签大小写/措辞不统一(如 "Long Context" vs "Long context"), 入库前需归一化
