// Temporary staging copy of the coach function on Inception's Mercury 2.5, for the test suite
// (COACH_FN=coach-staging node scripts/coach-eval/run.mjs). Same code and checks as coach; only the model
// differs. Students never call it. Delete it once the switch is decided.
import "../coach/index.ts";
import { setPlatform } from "../_lib/llm.ts";

const key = Deno.env.get("INCEPTION_API_KEY");
if (key) setPlatform({ baseUrl: "https://api.inceptionlabs.ai/v1", apiKey: key, model: "mercury-2.5" });
