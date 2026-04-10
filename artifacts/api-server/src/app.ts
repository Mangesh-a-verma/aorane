import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

const ALLOWED_ORIGINS = [
  /\.vercel\.app$/,
  /\.railway\.app$/,
  /\.onrender\.com$/,
  /localhost/,
  /127\.0\.0\.1/,
  /replit\.dev$/,
  /replit\.app$/,
];

if (process.env.ALLOWED_ORIGIN) {
  ALLOWED_ORIGINS.push(new RegExp(process.env.ALLOWED_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed = ALLOWED_ORIGINS.some((pattern) => pattern.test(origin));
      if (allowed) return callback(null, true);
      callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
