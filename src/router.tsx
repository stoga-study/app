import { createBrowserRouter } from "react-router";
import { RouteError } from "./components/RouteError";
import { Shell } from "./components/Shell";
import { WhatsNewGate } from "./components/WhatsNewGate";
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
import { ClassCards, DeckPage, Decks } from "./routes/Cards";
import NotePage from "./routes/Note";
import Practice from "./routes/Practice";
import NotFound from "./routes/NotFound";
import Onboarding from "./routes/Onboarding";
import Settings from "./routes/Settings";
import Search from "./routes/Search";
import Calendar from "./routes/Calendar";
import Coach from "./routes/Coach";
import Recap from "./routes/Recap";
import SharedSet from "./routes/SharedSet";
import Groups, { GroupPage, JoinGroup } from "./routes/Groups";
import GroupSet from "./routes/GroupSet";
import { CustomizeCoach, YourFace } from "./routes/Customize";
import PracticeTest from "./routes/PracticeTest";
import ExamPrep, { ReviewPack } from "./routes/ExamPrep";
import SourcePage from "./routes/Source";
import Subject from "./routes/Subject";
import Subjects from "./routes/Subjects";
import Tutor, { TutorHome } from "./routes/Tutor";
import Upload from "./routes/Upload";
import Viewer from "./routes/Viewer";
import SignIn from "./routes/SignIn";
import Welcome from "./routes/Welcome";
import WhatsNew, { Changelog } from "./routes/WhatsNew";
import Privacy from "./routes/Privacy";
import BrandPreview from "./routes/BrandPreview";

export const router = createBrowserRouter([
  {
    errorElement: <RouteError />,
    children: [
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
        element: <WhatsNewGate />,
        children: [
      { path: "whats-new", element: <WhatsNew /> },
      {
        element: <Shell />,
        children: [
          { index: true, element: <Home /> },
          { path: "subjects", element: <Subjects /> },
          { path: "subjects/:id", element: <Subject /> },
          { path: "subjects/:id/cards", element: <ClassCards /> },
          { path: "decks", element: <Decks /> },
          { path: "practice", element: <Practice /> },
          { path: "decks/:id", element: <DeckPage /> },
          { path: "sources/:id", element: <SourcePage /> },
          { path: "sources/:id/view", element: <Viewer /> },
          { path: "notes/:id", element: <NotePage /> },
          { path: "classes", element: <Classes /> },
          { path: "upload", element: <Upload /> },
          { path: "tutor", element: <TutorHome /> },
          { path: "tutor/:subjectId", element: <Tutor /> },
          { path: "review", element: <Review /> },
          { path: "review/session", element: <ReviewSession /> },
          { path: "quiz/:id", element: <Quiz /> },
          { path: "mistakes", element: <Mistakes /> },
          { path: "progress", element: <Progress /> },
          { path: "search", element: <Search /> },
          { path: "calendar", element: <Calendar /> },
          { path: "coach", element: <Coach /> },
          { path: "recap", element: <Recap /> },
          { path: "s/:token", element: <SharedSet /> },
          { path: "groups", element: <Groups /> },
          { path: "groups/:id", element: <GroupPage /> },
          { path: "groups/:id/sets/:setId", element: <GroupSet /> },
          { path: "join/:code", element: <JoinGroup /> },
          { path: "coach/customize", element: <CustomizeCoach /> },
          { path: "settings/face", element: <YourFace /> },
          { path: "practice-test", element: <PracticeTest /> },
          { path: "exam/:id", element: <ExamPrep /> },
          { path: "exam/:id/pack", element: <ReviewPack /> },
          { path: "plans", element: <Plans /> },
          { path: "feedback", element: <Feedback /> },
          { path: "settings", element: <Settings /> },
          { path: "changelog", element: <Changelog /> },
          { path: "privacy", element: <Privacy /> },
          { path: "preview/brand", element: <BrandPreview /> },
          { path: "*", element: <NotFound /> },
        ],
      },
        ],
      },
        ],
      },
    ],
  },
    ],
  },
]);
