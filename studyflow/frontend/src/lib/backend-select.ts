// Web build: no in-page backend (the FastAPI server is used).
// The Artifact build aliases this module to ../local/api (see vite.config.ts).
import type { Api } from "./api";

export const localApi: Api | null = null;
