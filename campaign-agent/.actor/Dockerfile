FROM apify/actor-node:24
COPY package*.json ./
RUN npm ci --include=dev
COPY . ./
RUN npm run build && npm prune --omit=dev
CMD ["node", "dist/main.js"]
