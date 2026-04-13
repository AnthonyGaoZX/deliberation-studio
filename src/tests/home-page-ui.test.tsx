import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage UI behavior", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("updates single-model debater labels when the shared provider changes", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /使用 DeepSeek|Use DeepSeek/i }));
    expect(screen.getByText("DeepSeek 1")).toBeTruthy();

    const providerSelect = screen.getAllByLabelText(/模型厂商|Provider/i)[0] as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "xai" } });

    expect(screen.getByText(/Grok \/ xAI 1/i)).toBeTruthy();
  });

  it("keeps output length toggle interactive", () => {
    render(<HomePage />);

    const buttons = screen.getAllByRole("button") as HTMLButtonElement[];
    const expansiveButton = buttons.find((button) => /Expansive|自由发挥/i.test(button.textContent ?? ""));
    const conciseButton = buttons.find((button) => /Concise|精简/i.test(button.textContent ?? ""));

    expect(expansiveButton).toBeTruthy();
    expect(conciseButton).toBeTruthy();

    fireEvent.click(expansiveButton as HTMLButtonElement);
    expect((expansiveButton as HTMLButtonElement).className).toContain("switch-option-active");

    fireEvent.click(conciseButton as HTMLButtonElement);
    expect((conciseButton as HTMLButtonElement).className).toContain("switch-option-active");
    expect((expansiveButton as HTMLButtonElement).className).not.toContain("switch-option-active");
  });

  it("locks provider selection and disables removal at the two-debater minimum in multi-model mode", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /专业模式|Pro mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /多模型|Multi-model/i }));
    fireEvent.click(screen.getByRole("button", { name: /添加 GPT \/ OpenAI|Add GPT \/ OpenAI/i }));

    const providerSelects = screen.getAllByLabelText(/模型厂商|Provider/i) as HTMLSelectElement[];
    expect(providerSelects.some((select) => select.disabled)).toBe(true);

    const removeButtons = screen.getAllByRole("button", { name: /移除这个辩手|Remove this debater/i }) as HTMLButtonElement[];
    expect(removeButtons).toHaveLength(2);
    expect(removeButtons.every((button) => button.disabled)).toBe(true);
  });

  it("shows external search API input only when DeepSeek search augmentation is relevant", () => {
    render(<HomePage />);

    expect(screen.queryByLabelText(/外部搜索 API|External search API/i)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /使用 DeepSeek|Use DeepSeek/i }));
    expect(screen.getByLabelText(/外部搜索 API|External search API/i)).toBeTruthy();

    const providerSelect = screen.getAllByLabelText(/模型厂商|Provider/i)[0] as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openai" } });

    expect(screen.queryByLabelText(/外部搜索 API|External search API/i)).toBeNull();
  });

  it("shows one global provider settings area instead of per-role api key forms", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /使用 DeepSeek|Use DeepSeek/i }));

    expect(screen.getAllByLabelText(/API Key/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/无需在这里重复填写连接信息|No need to repeat connection fields here/i)).toBeTruthy();
  });

  it("lets users manually type a model variant and see per-role test controls", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /使用 Gemini \/ Google|Use Gemini/i }));

    const customModelInput = screen.getByLabelText(/模型变体 自定义|Model variant custom/i) as HTMLInputElement;
    fireEvent.change(customModelInput, { target: { value: "gemini-2.5-flash" } });

    expect(customModelInput.value).toBe("gemini-2.5-flash");
    expect(screen.getAllByRole("button", { name: /测试输出|Test output/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /测试联网|Test web search/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /官方模型名称|official model names/i }).length).toBeGreaterThan(0);
  });

  it("reveals custom persona input and multi-model judge provider settings", () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: /专业模式|Pro mode/i }));
    fireEvent.click(screen.getByRole("button", { name: /使用 DeepSeek|Use DeepSeek/i }));

    const personaSelects = screen.getAllByLabelText(/人格|Persona/i) as HTMLSelectElement[];
    fireEvent.change(personaSelects[0], { target: { value: "custom" } });
    expect(screen.getByLabelText(/自定义人格描述|Custom persona description/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /多模型|Multi-model/i }));
    expect(screen.getByLabelText(/裁判模型厂商|Judge provider/i)).toBeTruthy();
    expect(screen.getAllByLabelText(/裁判模型变体|Judge model variant/i).length).toBeGreaterThan(0);
  });
});
