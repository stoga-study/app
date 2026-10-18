// Temporary staging copy of the tutor function on Inception's Mercury 2.5, for the test suite
// (TUTOR_FN=tutor-staging node scripts/tutor-eval/run.mjs). Same code and checks as tutor; only the model
// differs. Students never call it. Delete it once the switch is decided.
import "../tutor/index.ts";
import { setPlatform } from "../_lib/llm.ts";

const key = Deno.env.get("INCEPTION_API_KEY");
if (key) setPlatform({ baseUrl: "https://api.inceptionlabs.ai/v1", apiKey: key, model: "mercury-2.5" });
