FROM node:22-slim

# Install Playwright system deps + Chromium
RUN npx playwright install --with-deps chromium

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY dist/ ./dist/

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/server.js"]
