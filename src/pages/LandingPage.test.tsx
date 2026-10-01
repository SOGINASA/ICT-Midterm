import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthSession, clearApiSession } from "../services/apiClient";
import { useAuthStore } from "../store/useAuthStore";
import LandingPage from "./LandingPage";

const account: AuthSession = {
  access_token: "test-session",
  user: { id: "c58f5f21-920f-43a1-8f1b-9e28937cf001", email: "ayan@example.com" },
  recovery: false,
};

function renderLanding() {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<h1>My account workspace</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: jest.fn(), removeEventListener: jest.fn(),
    })),
  });
  clearApiSession();
  sessionStorage.clear();
  useAuthStore.setState({ session: null, ready: true, demo: false, recovery: false, error: null });
});

afterEach(() => { clearApiSession(); });

it("replaces every account entry with the workspace link, including the mobile menu", () => {
  useAuthStore.getState().acceptSession(account);
  renderLanding();
  fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));

  const entries = screen.getAllByRole("link", { name: "В приложение" });
  expect(entries).toHaveLength(5);
  entries.forEach((entry) => expect(entry).toHaveAttribute("href", "/app"));
  expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Get started" })).not.toBeInTheDocument();
});

it("waits for session restoration before exposing guest account controls", () => {
  useAuthStore.setState({ ready: false });
  renderLanding();
  expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "В приложение" })).not.toBeInTheDocument();

  act(() => { useAuthStore.getState().acceptSession(account); });
  expect(screen.getAllByRole("link", { name: "В приложение" })).toHaveLength(4);
  expect(screen.queryByRole("link", { name: "Create account" })).not.toBeInTheDocument();
});

it("keeps guest links for demo visitors and recovery-only sessions", () => {
  useAuthStore.getState().enterDemo();
  renderLanding();
  expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
  expect(screen.queryByRole("link", { name: "В приложение" })).not.toBeInTheDocument();

  act(() => { useAuthStore.getState().beginRecovery({ ...account, recovery: true }); });
  expect(screen.getByRole("link", { name: "Create account" })).toHaveAttribute("href", "/register");
  expect(screen.queryByRole("link", { name: "В приложение" })).not.toBeInTheDocument();
});

it("leaves demo mode when an already signed-in visitor opens their account", () => {
  useAuthStore.getState().acceptSession(account);
  useAuthStore.getState().enterDemo();
  renderLanding();
  const header = screen.getByRole("banner");
  fireEvent.click(within(header).getByRole("link", { name: "В приложение" }));

  expect(screen.getByRole("heading", { name: "My account workspace" })).toBeInTheDocument();
  expect(useAuthStore.getState().demo).toBe(false);
  expect(useAuthStore.getState().session?.user.id).toBe(account.user.id);
});
