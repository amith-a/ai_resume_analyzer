import express from "express";
import { healthRouter } from "./routes/health.routes.js";
import { resumeRouter } from "./routes/resume.routes.js";
import { errorHandlerMiddleware } from "./middlewares/error.middleware.js";

export const app = express();

app.use(express.json());

// Routes
app.use("/health", healthRouter);
app.use("/resumes", resumeRouter);

// Centralized Error Handling Middleware (must be mounted after all routes)
app.use(errorHandlerMiddleware);
