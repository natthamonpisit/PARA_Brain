<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vRVh2cBTUcaOIZ9-0HlasbLn7RJFwr09

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Create `.env.local` from `.env.example` and fill required values.
3. For local AI chat in the browser, set `VITE_GEMINI_API_KEY`.
4. For serverless APIs (`/api/*`), set secrets in Vercel env:
   - `GEMINI_API_KEY`
   - `LINE_CHANNEL_ACCESS_TOKEN`
   - `LINE_CHANNEL_SECRET`
   - `LINE_USER_ID`
   - `CRON_SECRET`
5. Run the app:
   `npm run dev`
