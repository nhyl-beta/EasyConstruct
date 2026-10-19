import app from "./src/app.js";

export default app;

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 8000);
  app.listen(port, () => {
    console.log(`✅ Server running → http://localhost:${port}`);
  });
}
