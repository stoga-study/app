import { createBrowserRouter } from "react-router";
import { Shell } from "./components/Shell";
import { RedirectIfSignedIn, RequireAuth, RequireOnboarded } from "./lib/auth/RequireAuth";
import Classes from "./routes/Classes";
import Feedback from "./routes/Feedback";
import Plans from "./routes/Plans";
import Mistakes from "./routes/Mistakes";
import Progress from "./routes/Progress";
import Quiz from "./routes/Quiz";
import Review from "./routes/Review";
import ReviewSession from "./routes/ReviewSession";
import Home from "./routes/Home";
import NotFound from "./routes/NotFound";
import Onboarding from "./routes/Onboarding";
import Settings from "./routes/Settings";
import SourcePage from "./routes/Source";
import Subject from "./routes/Subject";
import Subjects from "./routes/Subjects";
import Tutor, { TutorHome } from "./routes/Tutor";
import Upload from "./routes/Upload";
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
          { path: "subjects", element: <Subjects /> },
          { path: "subjects/:id", element: <Subject /> },
          { path: "sources/:id", element: <SourcePage /> },
          { path: "classes", element: <Classes /> },
          { path: "upload", element: <Upload /> },
          { path: "tutor", element: <TutorHome /> },
          { path: "tutor/:subjectId", element: <Tutor /> },
          { path: "review", element: <Review /> },
          { path: "review/session", element: <ReviewSession /> },
          { path: "quiz/:id", element: <Quiz /> },
          { path: "mistakes", element: <Mistakes /> },
          { path: "progress", element: <Progress /> },
          { path: "plans", element: <Plans /> },
          { path: "feedback", element: <Feedback /> },
          { path: "settings", element: <Settings /> },
          { path: "*", element: <NotFound /> },
        ],
      },
        ],
      },
    ],
  },
]);
