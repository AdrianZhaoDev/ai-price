import {
  render,
  screen,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ChangeBadge } from "@/components/change-badge";

describe("ChangeBadge", () => {
  it("opens from keyboard or touch-like click and closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <ChangeBadge
        label="降价"
        tone="positive"
        ariaLabel="模型降价"
        details={["原价格 ¥2", "现价格 ¥1"]}
      />,
    );

    const badge = screen.getByRole("button", { name: "模型降价" });
    badge.focus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("原价格 ¥2");

    await user.keyboard("{Escape}");
    await waitForElementToBeRemoved(() => screen.queryByRole("tooltip"));

    badge.blur();
    await user.click(badge);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("现价格 ¥1");
  });
});
