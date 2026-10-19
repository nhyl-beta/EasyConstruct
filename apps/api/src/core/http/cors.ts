import cors             from 'cors';
import { corsConfig }   from "../config/cors.js";

export const corsMiddleware = cors(corsConfig);