import express from "express";
import { aiRouter } from "./routes/ai.routes.js";
import { healthRouter } from "./routes/health.routes.js";

export const app = express();

app.use(express.json());

// Routes
app.use("/ai", aiRouter);
app.use("/health", healthRouter);
