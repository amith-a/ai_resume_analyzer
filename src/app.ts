import express from "express";
import { healthRouter } from "./routes/health.routes.js";
import { resumeRouter } from "./routes/resume.routes.js";
import { jobComparisonRouter } from "./routes/job-comparison.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { httpLoggerMiddleware } from "./middlewares/http-logger.middleware.js";
import { errorHandlerMiddleware } from "./middlewares/error.middleware.js";

export const app = express();

app.use(httpLoggerMiddleware);
app.use(express.json());

// Routes
app.use("/health", healthRouter);
app.use("/resumes", resumeRouter);
app.use("/jobs", jobComparisonRouter);
app.use("/search", searchRouter);
app.use("/retrieval", searchRouter);

// 404 Handler for unmatched routes
app.use((_req, res) => {
  res.status(404).json({
    status: "error",
    message: "Resource not found",
  });
});

// Centralized Error Handling Middleware (must be mounted after all routes)
app.use(errorHandlerMiddleware);
