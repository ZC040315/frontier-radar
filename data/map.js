// 前沿雷达 · 地图主干
// 每个节点回答两件事：这个领域在解决什么问题、现在卡在哪。
// nodes 里的 items 填 items.js 中的 id；留空数组表示「待补」，不是错误。

window.FRONTIER_MAP = [
  {
    domain: "med",
    label: "医疗健康",
    note: "AI 在这里的第一波突破不是替代医生，而是把实验和记录里最慢的环节变成可计算的事。",
    groups: [
      {
        label: null,
        nodes: [
          { id: "med-imaging", label: "医学影像诊断", problem: "从「一个任务训练一个模型」走向一个模型看所有片子", items: ["medgemini", "pathfm", "medgemma"] },
          { id: "med-protein", label: "蛋白质结构与药物发现", problem: "把实验里最慢、最贵的一步变成可计算", items: ["alphafold3", "boltz", "rfaa"] },
          { id: "med-text", label: "临床文本与病历", problem: "把医生写的自由文本变成结构化、可计算的数据", items: ["medpalm2", "healthscribe", "amie"] },
          { id: "med-surgery", label: "手术机器人与术中辅助", problem: "让机器帮医生看得更清、手更稳，而不是替医生做决定", items: ["s2hwm"] },
          { id: "med-wearable", label: "可穿戴与连续监测", problem: "把「一年体检一次」变成「全天连续观测」", items: ["applehealth", "stelo"] },
          { id: "med-regulatory", label: "医疗 AI 的监管与落地", problem: "一个会随数据变化的模型，怎么通过为静态器械写的审批", items: ["fdaaiml"] }
        ]
      }
    ]
  },
  {
    domain: "ai",
    label: "AI 与智能体",
    note: "这一支的分层和你 AI 学习地图用的是同一套词，方便两边互相引用。",
    groups: [
      {
        label: "地基层",
        nodes: [
          { id: "ai-token", label: "token 与分词", problem: "模型为什么按 token 计数，一个 token 大概是什么", items: ["transformer"] },
          { id: "ai-context", label: "上下文窗口", problem: "为什么长对话会「忘记」，输入越长越贵", items: ["gemini15"] },
          { id: "ai-training", label: "训练与微调", problem: "模型是怎么学会语言的，微调又在改什么", items: ["instructgpt"] },
          { id: "ai-sampling", label: "推理与采样", problem: "为什么同一个提示词每次结果不一样", items: ["nucleus"] },
          { id: "ai-hallucination", label: "幻觉", problem: "为什么它会一本正经地胡说，以及怎么减少", items: ["hallucinate"] }
        ]
      },
      {
        label: "主干层",
        nodes: [
          { id: "ai-prompt", label: "提示工程", problem: "角色 + 任务 + 约束 + 示例 + 拆步骤", items: ["cot"] },
          { id: "ai-rag", label: "RAG 与知识库", problem: "怎么让模型只依据你给的资料回答", items: ["rag"] },
          { id: "ai-tools", label: "工具调用", problem: "模型怎么真的去查、去算、去动手", items: ["mcp"] },
          { id: "ai-memory", label: "记忆", problem: "跨会话记住你，和「上下文长度」不是一回事", items: ["memgpt"] },
          { id: "ai-planning", label: "规划与多步执行", problem: "把一句话任务拆成能一步步做完的动作", items: ["react"] },
          { id: "ai-multiagent", label: "多智能体", problem: "什么时候拆成多个角色真有收益，什么时候只是更贵", items: ["multiagent"] },
          { id: "ai-eval", label: "评测与安全", problem: "怎么证明它变好了，而不是只挑好看的例子", items: ["helm"] }
        ]
      },
      {
        label: "前沿层",
        nodes: [
          { id: "ai-reasoning", label: "推理模型与测试时计算", problem: "用更多推理算力换更高的正确率", items: ["o1", "deepseekr1"] },
          { id: "ai-longctx", label: "长上下文与记忆架构", problem: "上下文变长之后，怎么让模型真的用得上", items: ["lostmiddle"] },
          { id: "ai-multimodal", label: "多模态与世界模型", problem: "从「理解文字」到「理解世界怎么运转」", items: ["sora"] },
          { id: "ai-ondevice", label: "端侧与蒸馏", problem: "把大模型的能力压进手机和眼镜", items: ["phi3"] },
          { id: "ai-agentinfra", label: "智能体基础设施", problem: "协议、沙箱、权限——让智能体能被安全地交出去干活", items: ["a2a"] }
        ]
      }
    ]
  },
  {
    domain: "prod",
    label: "数字产品与交互",
    note: "这一支看的是「人怎么用它」，而不是「它有多强」。",
    groups: [
      {
        label: null,
        nodes: [
          { id: "prod-paradigm", label: "交互范式", problem: "语音、无屏、空间计算、手势——下一个入口长什么样", items: ["visionpro", "rayban", "atlas"] },
          { id: "prod-productivity", label: "生产力工具", problem: "写作、编码、设计、会议被重做的顺序不一样", items: ["claude4", "cursor2", "notebooklm"] },
          { id: "prod-hardware", label: "消费硬件", problem: "可穿戴、机器人、家居：什么值得带在身上", items: ["neo", "oura"] },
          { id: "prod-platform", label: "平台与生态", problem: "能力怎么分发出去，谁从中收税", items: ["appssdk"] }
        ]
      }
    ]
  },
  {
    domain: "infra",
    label: "交叉与基础设施",
    note: "不直接面向用户，但决定了前面三支的天花板。",
    groups: [
      {
        label: null,
        nodes: [
          { id: "infra-compute", label: "算力与芯片", problem: "训练和推理的真实成本由谁决定", items: ["blackwell", "stargate", "ironwood", "deepseekv3"] },
          { id: "infra-data", label: "数据与版权", problem: "训练数据的来源边界正在被重新划定", items: ["copyright-office"] },
          { id: "infra-protocol", label: "协议与标准", problem: "谁定义了接口，谁就定义了生态的形状", items: ["a2a"] },
          { id: "infra-regulation", label: "监管与合规", problem: "规则怎么跟上技术的速度", items: ["euact", "caclabel"] }
        ]
      }
    ]
  }
];
