import { render, screen } from "@testing-library/react";
import { AnimationCredit } from "@/components/avatar/AnimationCredit";
import { getSign } from "@/lib/curriculum/loader";

describe("AnimationCredit", () => {
  it("cita el vídeo de la animación y enlaza la entrada", () => {
    render(
      <AnimationCredit
        credit={{
          source: "DILSE · Fundación CNSE",
          license: "CC BY-NC-SA 3.0",
          url: "https://x",
        }}
      />,
    );
    expect(screen.getByRole("link").textContent).toBe(
      "DILSE · Fundación CNSE · CC BY-NC-SA 3.0",
    );
  });

  it("sin vídeo avisa de que la animación es aproximada", () => {
    render(<AnimationCredit credit={undefined} />);
    expect(screen.getByText(/Animación aproximada/)).toBeTruthy();
  });

  it("los signos con vídeo no llevan el aviso", () => {
    const sign = getSign("HOLA")!;
    render(<AnimationCredit credit={sign.animationCredit} />);
    expect(screen.queryByText(/Animación aproximada/)).toBeNull();
  });
});
