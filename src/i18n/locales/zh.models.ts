const zhModels = {
  models: {
    selectModel: "选择模型",
    addModel: "添加模型",
    refreshConfig: "刷新配置",
    refreshingConfig: "刷新中…",
    refreshConfigFailed: "刷新失败：{{message}}",
    claude: {},
    codex: {
      gpt55: {
        label: "gpt-5.5",
        description: "适合复杂编码、研究与真实工作流的前沿模型",
      },
      gpt54: {
        label: "gpt-5.4",
        description: "适合日常编码的强力模型",
      },
      gpt54mini: {
        label: "gpt-5.4-mini",
        description: "适合简单编码任务的小型、快速、低成本模型",
      },
      gpt53codex: {
        label: "gpt-5.3-codex",
        description: "针对编码优化的模型",
      },
      gpt53codexSpark: {
        label: "gpt-5.3-codex-spark",
        description: "超快速编码模型",
      },
      gpt52: {
        label: "gpt-5.2",
        description: "适合专业工作与长时间 agent 任务的模型",
      },
    },
  },
};

export default zhModels;
