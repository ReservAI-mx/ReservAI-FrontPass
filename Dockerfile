FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Etapa: development | testing | staging | production
# Build:  docker build --build-arg STAGE=production -t passmanager-api .
# Runtime (sin rebuild): docker run -e STAGE=staging ...
ARG STAGE=development
ENV STAGE=${STAGE}

EXPOSE 3002

CMD node ./server.js 3002 $STAGE
