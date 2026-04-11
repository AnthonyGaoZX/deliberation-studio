import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("HomePage", () => {
  it("renders the hero and beginner flow", () => {
    render(<HomePage />);
    expect(screen.getByText(/Deliberation Studio|思辨剧场/i)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /English/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/Discussion type|讨论类型/i)).toBeTruthy();
    expect(screen.getByText(/Output length|输出长度/i)).toBeTruthy();
  });
});
