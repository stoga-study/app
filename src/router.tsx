import { createBrowserRouter } from "react-router";
import { Shell } from "./components/Shell";
import Home from "./routes/Home";
import NotFound from "./routes/NotFound";
import Placeholder from "./routes/Placeholder";
import Settings from "./routes/Settings";

export const router = createBrowserRouter([
  {
    element: <Shell />,
    children: [
      { index: true, element: <Home /> },
      { path: "subjects", element: <Placeholder title="Subjects" milestone="milestone 6" /> },
      { path: "upload", element: <Placeholder title="Add notes" milestone="milestone 4" /> },
      { path: "tutor", element: <Placeholder title="AI tutor" milestone="milestone 7" /> },
      { path: "review", element: <Placeholder title="Review" milestone="milestone 6" /> },
      { path: "progress", element: <Placeholder title="Progress" milestone="milestone 6" /> },
      { path: "plans", element: <Placeholder title="Plans and funding" milestone="milestone 8" /> },
      { path: "settings", element: <Settings /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
