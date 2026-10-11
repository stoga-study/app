import { createBrowserRouter } from "react-router";
import { Shell } from "./components/Shell";
import { RedirectIfSignedIn, RequireAuth, RequireOnboarded } from "./lib/auth/RequireAuth";
import Classes from "./routes/Classes";
import Home from "./routes/Home";
import NotFound from "./routes/NotFound";
import Onboarding from "./routes/Onboarding";
import Placeholder from "./routes/Placeholder";
import Settings from "./routes/Settings";
import SignIn from "./routes/SignIn";
import Welcome from "./routes/Welcome";

export const router = createBrowserRouter([
  {
    element: <RedirectIfSignedIn />,
    children: [
      { path: "welcome", element: <Welcome /> },
      { path: "sign-in", element: <SignIn /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "onboarding", element: <Onboarding /> },
      {
        element: <RequireOnboarded />,
        children: [
      {
        element: <Shell />,
        children: [
          { index: true, element: <Home /> },
          { path: "subjects", element: <Placeholder title="Subjects" milestone="milestone 6" /> },
          { path: "classes", element: <Classes /> },
          { path: "upload", element: <Placeholder title="Add notes" milestone="milestone 4" /> },
          { path: "tutor", element: <Placeholder title="AI tutor" milestone="milestone 7" /> },
          { path: "review", element: <Placeholder title="Review" milestone="milestone 6" /> },
          { path: "progress", element: <Placeholder title="Progress" milestone="milestone 6" /> },
          { path: "plans", element: <Placeholder title="Plans and funding" milestone="milestone 8" /> },
          { path: "settings", element: <Settings /> },
          { path: "*", element: <NotFound /> },
        ],
      },
        ],
      },
    ],
  },
]);
