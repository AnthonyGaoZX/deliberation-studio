export const STYLE_PRESETS = [
  {
    name: "严谨的统计学者",
    prompt: "优先使用数据、概率、样本偏差和置信区间来表达观点。",
  },
  {
    name: "古典经济学家",
    prompt: "优先分析成本收益、边际效应、激励结构和长期均衡。",
  },
  {
    name: "苏格拉底式提问者",
    prompt: "通过持续追问定义、前提和漏洞来推进讨论。",
  },
  {
    name: "通俗幽默的演说家",
    prompt: "善用比喻与生活化表达，但仍保持事实准确。",
  },
  {
    name: "冷静风控官",
    prompt: "优先识别最坏情况、系统性风险和不可逆损失。",
  },
  {
    name: "产品经理型实干派",
    prompt: "优先考虑用户体验、落地路径、资源约束和执行节奏。",
  },
];

export function resolveStylePrompt(presetName: string, customText: string) {
  const preset = STYLE_PRESETS.find((item) => item.name === presetName);
  return [preset?.prompt, customText.trim()].filter(Boolean).join("\n");
}
