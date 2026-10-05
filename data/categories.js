// 前沿雷达 · 类别体系
// 领域（domain）是四个大类，类别（category）是它下面更具体的一层。
// 每条正式条目和每条每日线索都必须落在其中一个类别里——这样「某条信息属于哪一类」
// 就不再靠记忆，而是一个固定字段。
//
// 加新类别时：在这里补一条，并在 scripts/fetch-daily.mjs 的 CATEGORY_RULES 里补对应关键词。

window.FRONTIER_CATEGORIES = [
  // ---- 医疗健康 ----
  {
    id: "med-imaging",
    domain: "med",
    label: "医学影像与诊断",
    desc: "看片子、病理切片、辅助诊断这类「把图像变成判断」的进展。",
  },
  {
    id: "med-drug",
    domain: "med",
    label: "药物发现与蛋白质",
    desc: "蛋白质结构预测、分子设计、把实验里最慢的一步变成可计算。",
  },
  {
    id: "med-clinic",
    domain: "med",
    label: "临床文本与医疗流程",
    desc: "病历、问诊对话、临床文档与医疗问答，落在医生日常工作流上的东西。",
  },
  {
    id: "med-device",
    domain: "med",
    label: "可穿戴与医疗器械",
    desc: "连续监测、手术机器人、植入与传感设备：进入身体和临床现场的硬件。",
  },

  // ---- AI 与智能体 ----
  {
    id: "ai-model",
    domain: "ai",
    label: "大模型与推理",
    desc: "训练、微调、推理、上下文与采样：模型本身能力是怎么来的。",
  },
  {
    id: "ai-agent",
    domain: "ai",
    label: "智能体与工具",
    desc: "工具调用、记忆、规划、多智能体，以及让它们互相说话的协议。",
  },
  {
    id: "ai-multimodal",
    domain: "ai",
    label: "多模态与生成",
    desc: "图像、视频、语音与 3D 生成，以及「世界模型」这条线。",
  },
  {
    id: "ai-safety",
    domain: "ai",
    label: "评测、安全与对齐",
    desc: "怎么衡量它变好了、幻觉从哪来、对齐与安全边界在哪里。",
  },

  // ---- 数字产品与交互 ----
  {
    id: "prod-paradigm",
    domain: "prod",
    label: "交互范式与终端",
    desc: "眼镜、头显、空间计算、语音与无屏交互：下一个入口长什么样。",
  },
  {
    id: "prod-tools",
    domain: "prod",
    label: "生产力工具",
    desc: "写作、编码、会议、知识管理：日常工作被重做的那些环节。",
  },
  {
    id: "prod-platform",
    domain: "prod",
    label: "平台与生态",
    desc: "能力怎么分发出去、谁制定规则、谁从中收税。",
  },
  {
    id: "prod-hardware",
    domain: "prod",
    label: "消费硬件与机器人",
    desc: "戒指、机器人、家居设备：能被普通人买回家或戴在身上的东西。",
  },

  // ---- 交叉与基础设施 ----
  {
    id: "infra-compute",
    domain: "infra",
    label: "算力与芯片",
    desc: "GPU、TPU、数据中心与训练成本：决定前面三支天花板的东西。",
  },
  {
    id: "infra-data",
    domain: "infra",
    label: "数据与版权",
    desc: "训练数据的来源边界、版权判定与授权交易正在被重新划定。",
  },
  {
    id: "infra-policy",
    domain: "infra",
    label: "监管与合规",
    desc: "法案、标准、审批与标识要求：规则怎么跟上技术的速度。",
  },
];
