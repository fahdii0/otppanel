import serverless from "serverless-http";
import { createApiApp } from "../src/api-app.ts";

const app = createApiApp();

export const handler = serverless(app);
