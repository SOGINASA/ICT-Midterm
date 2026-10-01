import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import OnboardingPage from "./OnboardingPage";
import { seedCategories } from "../data/seed";
import { OnboardingInput, UserProfile } from "../types/finance";

const profile: UserProfile = {
  id: "setup-user",
  displayName: "Ayan",
  currency: "KZT",
  monthlyBudget: 120000,
  onboardingCompleted: false,
};
const key = "tengeflow.account.setup-user.onboarding.v1";

function mount(
  onComplete = jest
    .fn<Promise<void>, [OnboardingInput]>()
    .mockResolvedValue(undefined),
) {
  return {
    onComplete,
    ...render(
      <MemoryRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <OnboardingPage
          profile={profile}
          categories={seedCategories}
          onComplete={onComplete}
          onSignOut={jest.fn().mockResolvedValue(undefined)}
        />
      </MemoryRouter>,
    ),
  };
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}
function finalStep() {
  next();
  next();
}

beforeEach(() => {
  sessionStorage.clear();
  jest.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

it("restores the current step and budget after reload", () => {
  const view = mount();
  next();
  fireEvent.change(screen.getByLabelText("Your monthly budget"), {
    target: { value: "85000.25" },
  });
  view.unmount();
  mount();
  expect(screen.getByLabelText("Your monthly budget")).toHaveValue("85000.25");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Give your month",
  );
});

it("preserves edited limits when going back to change the budget", () => {
  mount();
  finalStep();
  fireEvent.change(screen.getByLabelText("Food monthly limit"), {
    target: { value: "12345.67" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  fireEvent.change(screen.getByLabelText("Your monthly budget"), {
    target: { value: "60000" },
  });
  next();
  expect(screen.getByLabelText("Food monthly limit")).toHaveValue("12345.67");
  expect(screen.getByText(/over your monthly budget/)).toBeInTheDocument();
});

it("rejects invalid amounts and over-allocation before contacting the backend", () => {
  const { onComplete } = mount();
  next();
  fireEvent.change(screen.getByLabelText("Your monthly budget"), {
    target: { value: "0.001" },
  });
  next();
  expect(screen.getByLabelText("Your monthly budget")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  fireEvent.change(screen.getByLabelText("Your monthly budget"), {
    target: { value: "100" },
  });
  next();
  fireEvent.change(screen.getByLabelText("Food monthly limit"), {
    target: { value: "200" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "more than your monthly budget",
  );
  fireEvent.change(screen.getByLabelText("Food monthly limit"), {
    target: { value: "1.001" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  expect(screen.getByLabelText("Food monthly limit")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(onComplete).not.toHaveBeenCalled();
});

it("allocates even a three-tiyn budget exactly, with comma decimal input", async () => {
  const { onComplete } = mount();
  next();
  fireEvent.change(screen.getByLabelText("Your monthly budget"), {
    target: { value: "0,03" },
  });
  next();
  fireEvent.click(screen.getByRole("button", { name: "Use suggested limits" }));
  expect(
    screen.getByText("Everything has a place. You’re ready to begin."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Open my workspace" }),
    ).toBeEnabled(),
  );
  expect(onComplete).toHaveBeenCalledTimes(1);
  const payload = onComplete.mock.calls[0][0];
  expect(payload.monthlyBudget).toBe(0.03);
  expect(
    Object.values(payload.categoryLimits).reduce(
      (sum, value) => sum + Math.round(value * 100),
      0,
    ),
  ).toBe(3);
});

it("retains the draft and the user's choices when saving fails", async () => {
  const onComplete = jest
    .fn<Promise<void>, [OnboardingInput]>()
    .mockRejectedValue(new Error("Connection lost. Please try again."));
  mount(onComplete);
  finalStep();
  fireEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Connection lost");
  expect(JSON.parse(sessionStorage.getItem(key)!).step).toBe(3);
  expect(screen.getByLabelText("Food monthly limit")).toHaveValue("48000");
  expect(
    screen.getByRole("button", { name: "Open my workspace" }),
  ).toBeEnabled();
});

it("disables navigation while saving and clears the draft only after success", async () => {
  let resolve!: () => void;
  const onComplete = jest
    .fn<Promise<void>, [OnboardingInput]>()
    .mockReturnValue(
      new Promise<void>((complete) => {
        resolve = complete;
      }),
    );
  mount(onComplete);
  finalStep();
  fireEvent.click(screen.getByRole("button", { name: "Open my workspace" }));
  expect(
    screen.getByRole("button", { name: "Saving your setup…" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
  expect(sessionStorage.getItem(key)).not.toBeNull();
  await act(async () => {
    resolve();
  });
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("starts category limits within the chosen budget before the user edits them", () => {
  mount();
  next();
  fireEvent.click(screen.getByRole("button", { name: "₸60,000" }));
  next();
  expect(screen.getByLabelText("Food monthly limit")).toHaveValue("24000");
  expect(
    screen.getByText("Everything has a place. You’re ready to begin."),
  ).toBeInTheDocument();
});

it.each([
  "{broken",
  JSON.stringify({
    version: 1,
    userId: "another-user",
    step: 3,
    displayName: "Another person",
    monthlyBudget: "999",
    categoryLimits: {},
  }),
])("ignores invalid or other-account setup drafts", (value) => {
  sessionStorage.setItem(key, value);
  mount();
  expect(screen.getByLabelText("What should we call you?")).toHaveValue("Ayan");
  expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
});
